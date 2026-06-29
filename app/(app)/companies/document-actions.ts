"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractEntities } from "@/lib/documents/extract";
import { cleanPdfText, hasReadableText } from "@/lib/documents/clean";
import { fetchUrlContent, urlSource } from "@/lib/documents/fetch-url";
import { applyMappedIngest } from "@/lib/ingestion/apply";
import { diffDocuments } from "@/lib/documents/diff";
import type { ExtractedEntities } from "@/lib/documents/heuristic";

const DOC_BUCKET = "documents";

export interface DocResult {
  ok?: boolean;
  error?: string;
  engine?: "llm" | "heuristic";
  roundsAdded?: number;
  valuationsAdded?: number;
  newsAdded?: number;
  competitorsAdded?: number;
}

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function ownsCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
) {
  const { data } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  return !!data;
}

function revalidate(companyId: string) {
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/dashboard");
  revalidatePath("/fund");
}

/**
 * Data-room diff: compare the new document's extracted facts against the most
 * recent prior document for the same company, so successive board decks become
 * a tracked change-set. Returns the diff (when non-empty) + the prior doc id.
 */
async function priorDocDiff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  entities: ExtractedEntities,
): Promise<{ diff: Record<string, unknown> | null; diffVs: string | null }> {
  const { data: prev } = await supabase
    .from("documents")
    .select("id, extracted_data")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev?.extracted_data) return { diff: null, diffVs: null };
  const d = diffDocuments(
    prev.extracted_data as unknown as ExtractedEntities,
    entities,
  );
  return {
    diff: d.changes.length ? (d as unknown as Record<string, unknown>) : null,
    diffVs: prev.id,
  };
}

/** Ingest a news/document URL: fetch → extract → route to the asset's tabs. */
export async function processDocumentUrl(
  companyId: string,
  url: string,
): Promise<DocResult> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  if (!/^https?:\/\//i.test(url)) return { error: "Enter a valid http(s) URL." };
  if (!(await ownsCompany(supabase, companyId)))
    return { error: "Company not found." };

  try {
    const { title, text } = await fetchUrlContent(url);
    if (text.length < 40) return { error: "No readable content at that URL." };

    const source = urlSource(url);
    const { engine, entities } = await extractEntities(text, {
      title,
      source,
      url,
    });
    const { diff, diffVs } = await priorDocDiff(supabase, companyId, entities);
    const applied = await applyMappedIngest(supabase, companyId, entities);

    await supabase.from("documents").insert({
      company_id: companyId,
      user_id: user.id,
      file_path: url,
      type: "url",
      extracted_data: entities as unknown as Record<string, unknown>,
      diff,
      diff_vs: diffVs,
      status: "done",
    });

    revalidate(companyId);
    return { ok: true, engine, ...applied };
  } catch (e) {
    return { error: `Processing failed: ${(e as Error).message}` };
  }
}

/** Ingest an uploaded PDF: OCR/parse → extract → route to the asset's tabs. */
export async function processDocumentPdf(
  companyId: string,
  formData: FormData,
): Promise<DocResult> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "No file provided." };
  if (!file.name.toLowerCase().endsWith(".pdf"))
    return { error: "Only PDF files are supported." };
  if (!(await ownsCompany(supabase, companyId)))
    return { error: "Company not found." };

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    return await ingestPdfBuffer(supabase, companyId, user.id, buf, file.name, file.name);
  } catch (e) {
    return { error: `Processing failed: ${(e as Error).message}` };
  }
}

/** Parse a PDF buffer → extract entities → route to tabs + record the document. */
async function ingestPdfBuffer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
  buf: Uint8Array,
  filename: string,
  filePath: string,
): Promise<DocResult> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buf });
  let raw = "";
  try {
    // Use pdf-parse's line-aware extraction, then join the per-page text
    // ourselves to avoid its "-- N of M --" page-separator markers.
    const r = await parser.getText();
    raw = r?.pages?.length
      ? r.pages.map((p) => p.text).join("\n\n")
      : (r?.text ?? "");
  } finally {
    await parser.destroy?.();
  }

  // Strip page markers, control chars, decorative runs, and re-join hyphenated
  // line breaks into readable prose before extraction.
  const text = cleanPdfText(raw);

  if (!hasReadableText(text))
    return {
      error:
        "This PDF has little or no extractable text — it looks image-based (e.g. a slide deck), so OCR is required. See ARCHITECTURE.md.",
    };

  const title = filename.replace(/\.pdf$/i, "");
  const source = `pdf:${filename}`;
  const { engine, entities } = await extractEntities(text, { title, source });
  const { diff, diffVs } = await priorDocDiff(supabase, companyId, entities);
  const applied = await applyMappedIngest(supabase, companyId, entities);

  await supabase.from("documents").insert({
    company_id: companyId,
    user_id: userId,
    file_path: filePath,
    type: "pdf",
    extracted_data: entities as unknown as Record<string, unknown>,
    diff,
    diff_vs: diffVs,
    status: "done",
  });

  revalidate(companyId);
  return { ok: true, engine, ...applied };
}

/**
 * Issue a one-time signed URL so the browser can upload a PDF straight to
 * Storage — bypassing the Server Action body limit (1MB local / 4.5MB on
 * Vercel) that breaks large investor decks. Scoped to a folder the user owns.
 */
export async function createDocUploadUrl(
  companyId: string,
  filename: string,
): Promise<{ path?: string; token?: string; error?: string }> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  if (!filename.toLowerCase().endsWith(".pdf"))
    return { error: "Only PDF files are supported." };
  if (!(await ownsCompany(supabase, companyId)))
    return { error: "Company not found." };

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const path = `${companyId}/${Date.now()}-${safe}`;
  const { data, error } = await createAdminClient()
    .storage.from(DOC_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "Could not start upload." };
  return { path: data.path, token: data.token };
}

/** Process a PDF already uploaded to Storage: download → parse → route. */
export async function processStoredPdf(
  companyId: string,
  path: string,
): Promise<DocResult> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not authenticated." };
  if (!(await ownsCompany(supabase, companyId)))
    return { error: "Company not found." };
  // The path must live under this company's own folder.
  if (!path.startsWith(`${companyId}/`)) return { error: "Invalid document path." };

  try {
    const { data: blob, error } = await createAdminClient()
      .storage.from(DOC_BUCKET)
      .download(path);
    if (error || !blob) return { error: `Upload not found: ${error?.message ?? ""}` };
    const buf = new Uint8Array(await blob.arrayBuffer());
    const filename = (path.split("/").pop() ?? "document.pdf").replace(/^\d+-/, "");
    return await ingestPdfBuffer(supabase, companyId, user.id, buf, filename, path);
  } catch (e) {
    return { error: `Processing failed: ${(e as Error).message}` };
  }
}
