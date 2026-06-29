"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import {
  createDocUploadUrl,
  processDocumentUrl,
  processStoredPdf,
  type DocResult,
} from "@/app/(app)/companies/document-actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function AddDocumentDialog({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DocResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function run(fn: () => Promise<DocResult>) {
    setResult(null);
    start(async () => {
      try {
        const res = await fn();
        setResult(res);
        if (res.ok) router.refresh();
      } catch {
        // Transport-level failure (network dropped) — surface it instead of
        // crashing the page with an unhandled error overlay.
        setResult({
          error: "Something went wrong — check your connection and try again.",
        });
      }
    });
  }

  function reset() {
    setResult(null);
    setFile(null);
    setUrl("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Sparkles className="h-3.5 w-3.5" /> Add document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Document intelligence</DialogTitle>
          <DialogDescription>
            Upload a PDF or paste a news/document URL. The pipeline extracts
            valuations, funding rounds, and news and routes them to this
            company&apos;s tabs.
          </DialogDescription>
        </DialogHeader>

        {result?.ok ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="text-sm">
                <p className="font-medium">
                  Extracted via{" "}
                  {result.engine === "llm"
                    ? "LLM"
                    : result.engine === "llm-vision"
                      ? "Claude vision (OCR)"
                      : result.engine === "grok-vision"
                        ? "Grok vision (OCR)"
                        : "heuristic"}{" "}
                  engine
                </p>
                <p className="mt-1 text-muted-foreground">
                  Routed to tabs — Valuation:{" "}
                  <strong className="text-foreground">
                    +{result.valuationsAdded}
                  </strong>
                  , Funding Rounds:{" "}
                  <strong className="text-foreground">
                    +{result.roundsAdded}
                  </strong>
                  , News:{" "}
                  <strong className="text-foreground">+{result.newsAdded}</strong>
                  , Competitors:{" "}
                  <strong className="text-foreground">
                    +{result.competitorsAdded ?? 0}
                  </strong>
                  .
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Add another
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="pdf">
            <TabsList className="w-full">
              <TabsTrigger value="pdf" className="flex-1 gap-2">
                <FileText className="h-4 w-4" /> Upload PDF
              </TabsTrigger>
              <TabsTrigger value="url" className="flex-1 gap-2">
                <Link2 className="h-4 w-4" /> From URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pdf" className="space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors",
                  dragging
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <UploadCloud className="h-7 w-7 text-muted-foreground" />
                {file ? (
                  <span className="text-sm font-medium">{file.name}</span>
                ) : (
                  <>
                    <span className="text-sm font-medium">
                      Drag &amp; drop a PDF
                    </span>
                    <span className="text-xs text-muted-foreground">
                      or click to browse — investor reports, decks, statements
                    </span>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {result?.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {result.error}
                </p>
              )}
              <Button
                className="w-full"
                disabled={!file || pending}
                onClick={() => {
                  if (!file) return;
                  if (file.size > 50 * 1024 * 1024) {
                    setResult({
                      error: `That PDF is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 50MB. Try a smaller file.`,
                    });
                    return;
                  }
                  const theFile = file;
                  run(async () => {
                    // Upload straight to Storage (no Server Action body limit),
                    // then process the stored file server-side.
                    const ticket = await createDocUploadUrl(companyId, theFile.name);
                    if (ticket.error || !ticket.path || !ticket.token)
                      return { error: ticket.error ?? "Could not start upload." };
                    const supabase = createBrowserClient();
                    const { error: upErr } = await supabase.storage
                      .from("documents")
                      .uploadToSignedUrl(ticket.path, ticket.token, theFile, {
                        contentType: "application/pdf",
                      });
                    if (upErr) return { error: `Upload failed: ${upErr.message}` };
                    return processStoredPdf(companyId, ticket.path);
                  });
                }}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                  </>
                ) : (
                  "Extract & route"
                )}
              </Button>
            </TabsContent>

            <TabsContent value="url" className="space-y-3">
              <Input
                placeholder="https://techcrunch.com/…/company-raises-series-b"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url && !pending) {
                    run(() => processDocumentUrl(companyId, url));
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Paste a funding announcement, press release, or filing URL.
              </p>
              {result?.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {result.error}
                </p>
              )}
              <Button
                className="w-full"
                disabled={!url || pending}
                onClick={() => run(() => processDocumentUrl(companyId, url))}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                  </>
                ) : (
                  "Extract & route"
                )}
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
