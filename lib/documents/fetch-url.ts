import "server-only";

export interface FetchedDoc {
  title: string;
  text: string;
}

/** Fetch a URL and reduce it to a title + plain text for extraction. */
export async function fetchUrlContent(url: string): Promise<FetchedDoc> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (PPIT Document Intelligence)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Could not fetch URL (HTTP ${res.status})`);
  const html = await res.text();

  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  let title = (og?.[1] || titleTag?.[1] || url).trim();
  try {
    if (title === url) title = new URL(url).hostname;
  } catch {
    /* keep title */
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, text };
}

/** Host label for provenance, e.g. "url:techcrunch.com". */
export function urlSource(url: string): string {
  try {
    return `url:${new URL(url).hostname}`;
  } catch {
    return "url:document";
  }
}
