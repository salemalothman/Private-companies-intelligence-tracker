"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractEntities } from "@/lib/documents/extract";
import { fetchUrlContent, urlSource } from "@/lib/documents/fetch-url";
import { applyMappedIngest } from "@/lib/ingestion/apply";

export interface DocResult {
  ok?: boolean;
  error?: string;
  engine?: "llm" | "heuristic";
  roundsAdded?: number;
  valuationsAdded?: number;
  newsAdded?: number;
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
    const applied = await applyMappedIngest(supabase, companyId, entities);

    await supabase.from("documents").insert({
      company_id: companyId,
      user_id: user.id,
      file_path: url,
      type: "url",
      extracted_data: entities as unknown as Record<string, unknown>,
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
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    let text = "";
    try {
      const r = await parser.getText();
      text = r?.text ?? "";
    } finally {
      await parser.destroy?.();
    }

    if (text.trim().length < 40)
      return {
        error:
          "No extractable text (the PDF may be scanned — OCR is required, see ARCHITECTURE.md).",
      };

    const title = file.name.replace(/\.pdf$/i, "");
    const source = `pdf:${file.name}`;
    const { engine, entities } = await extractEntities(text, { title, source });
    const applied = await applyMappedIngest(supabase, companyId, entities);

    await supabase.from("documents").insert({
      company_id: companyId,
      user_id: user.id,
      file_path: file.name,
      type: "pdf",
      extracted_data: entities as unknown as Record<string, unknown>,
      status: "done",
    });

    revalidate(companyId);
    return { ok: true, engine, ...applied };
  } catch (e) {
    return { error: `Processing failed: ${(e as Error).message}` };
  }
}
