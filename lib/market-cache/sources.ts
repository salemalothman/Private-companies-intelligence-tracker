import "server-only";
import type { Segment } from "@/lib/market-cache/parse";

const ARCHIVE_URL =
  "https://us8.campaign-archive.com/home/?u=c1009bfb683b6db1d8b71e4e8&id=3efc966b29";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function decode(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&#034;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** MM/DD/YYYY -> YYYY-MM-DD. */
function toIso(d: string): string | null {
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

interface ArchiveEntry {
  asOf: string;
  title: string;
  url: string;
}

/** Parse the archive index HTML into dated campaign entries (newest first). */
function parseIndex(html: string): ArchiveEntry[] {
  const re =
    /(\d{2}\/\d{2}\/\d{4})[\s\S]{0,400}?<a href="(https?:\/\/eepurl\.com\/[^"]+)" title="([^"]*)"/g;
  const out: ArchiveEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const asOf = toIso(m[1]);
    if (asOf) out.push({ asOf, url: m[2], title: decode(m[3]) });
  }
  return out;
}

/** Strip an HTML email body down to sentences that carry a dollar figure. */
function bodySentences(html: string): string {
  const text = decode(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
  return text
    .split(/(?<=[.;!?])\s+/)
    .filter((s) => /\$\s?[\d.,]+\s*(?:[kmbt]|million|billion|trillion)\b/i.test(s))
    .slice(0, 40)
    .join(". ");
}

async function get(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return { html: await res.text(), finalUrl: res.url };
}

export interface AgDillonSegments {
  /** Clean, structured headline lines ("Company $X valuation; ..."). */
  headlines: Segment[];
  /** Narrative dollar-figure sentences from recent issues (noisier). */
  bodies: Segment[];
}

/**
 * Fetch the AG Dillon archive index plus the most-recent `maxIssues` campaign
 * bodies. Headlines and bodies are returned separately so the ingestor can
 * trust headline-named companies and use the noisier body prose only to enrich
 * figures for companies the headlines already name (the ranked tables that
 * would disambiguate everything else are images).
 */
export async function fetchAgDillonSegments(maxIssues = 6): Promise<AgDillonSegments> {
  const { html: indexHtml } = await get(ARCHIVE_URL);
  const entries = parseIndex(indexHtml);

  const headlines: Segment[] = entries.map((e) => ({
    text: e.title,
    asOf: e.asOf,
    url: e.url,
  }));

  const bodies: Segment[] = [];
  for (const e of entries.slice(0, maxIssues)) {
    try {
      const { html, finalUrl } = await get(e.url);
      const body = bodySentences(html);
      if (body) bodies.push({ text: body, asOf: e.asOf, url: finalUrl });
    } catch {
      // Best-effort: a single issue fetch failure doesn't abort the run.
    }
  }

  return { headlines, bodies };
}
