import "server-only";
import type {
  ConnectorCompanyProfile,
  ConnectorFundingRound,
  ConnectorNewsItem,
  DataConnector,
} from "@/lib/connectors/types";

const SOURCE = "sec-edgar";
const EFTS = "https://efts.sec.gov/LATEST/search-index";

/** SEC requires every request to declare a contact User-Agent. */
function headers() {
  return {
    "User-Agent": process.env.SEC_USER_AGENT ?? "",
    Accept: "application/json",
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface FormDHit {
  name: string;
  date?: string;
  cik: string;
  accession: string;
  doc: string;
}

/** Full-text search EDGAR for a company's Form D filings, filtered by name. */
async function searchFormD(query: string): Promise<FormDHit[]> {
  const url = `${EFTS}?q=${encodeURIComponent(`"${query}"`)}&forms=D`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    hits?: { hits?: Array<{ _id?: string; _source?: Record<string, unknown> }> };
  };
  const hits = data.hits?.hits ?? [];
  const q = norm(query);

  const out: FormDHit[] = [];
  for (const h of hits) {
    const src = h._source ?? {};
    const display = (src.display_names as string[] | undefined)?.[0] ?? "";
    const filer = display.replace(/\s*\(CIK.*$/i, "").trim();
    const f = norm(filer);
    // Avoid fuzzy false-positives (e.g. "Ramp" -> "ON-RAMP WIRELESS").
    if (!f.startsWith(q) && !q.startsWith(f)) continue;
    // Skip SPV / fund vehicles named after the company (not the company's own raise).
    if (/\bspv\b|\bfund\b|a series of/i.test(filer)) continue;

    const id = h._id ?? "";
    const [accession, doc] = id.split(":");
    const cik = (src.ciks as string[] | undefined)?.[0] ?? "";
    if (!accession || !cik) continue;

    out.push({
      name: filer,
      date: (src.file_date as string) ?? undefined,
      cik,
      accession,
      doc: doc || "primary_doc.xml",
    });
  }
  return out;
}

interface FormDDetail {
  entityName?: string;
  sector?: string;
  amountSold?: number;
}

/** Fetch + parse a Form D primary document for offering amount and industry. */
async function fetchFormDDetail(hit: FormDHit): Promise<FormDDetail> {
  const cikNum = String(Number(hit.cik)); // strip leading zeros
  const accNoDashes = hit.accession.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDashes}/${hit.doc}`;
  const res = await fetch(url, { headers: { "User-Agent": process.env.SEC_USER_AGENT ?? "" } });
  if (!res.ok) return {};
  const xml = await res.text();

  const tag = (name: string) => {
    const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"));
    return m?.[1]?.trim();
  };
  const soldRaw = tag("totalAmountSold");
  const amountSold = soldRaw && /^\d+(\.\d+)?$/.test(soldRaw)
    ? Number(soldRaw)
    : undefined;

  return {
    entityName: tag("entityName"),
    sector: tag("industryGroupType"),
    amountSold,
  };
}

/**
 * SEC EDGAR connector. Surfaces a company's Regulation D (Form D) private
 * fundraising filings as funding rounds, and a minimal profile from the filing.
 * Keyless — only requires the SEC_USER_AGENT contact header. Gated in the
 * registry; degrades to empty results on any error.
 */
export class SecEdgarConnector implements DataConnector {
  readonly id = "sec-edgar";

  async fetchCompanyProfile(
    query: string,
  ): Promise<ConnectorCompanyProfile | null> {
    try {
      const hits = await searchFormD(query);
      if (hits.length === 0) return null;
      const detail = await fetchFormDDetail(hits[0]).catch(
        () => ({}) as FormDDetail,
      );
      return {
        name: detail.entityName || hits[0].name,
        country: "United States",
        sector: detail.sector || undefined,
      };
    } catch {
      return null;
    }
  }

  async fetchFundingRounds(query: string): Promise<ConnectorFundingRound[]> {
    try {
      const hits = await searchFormD(query);
      // Most-recent few filings; dedupe by date.
      const seen = new Set<string>();
      const recent = hits
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .filter((h) => {
          const key = h.date ?? h.accession;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 3);

      const details = await Promise.all(
        recent.map((h) => fetchFormDDetail(h).catch(() => ({}) as FormDDetail)),
      );

      return recent.map((h, i) => ({
        round: "Reg D (Form D)",
        date: h.date,
        amountRaised: details[i].amountSold,
        source: SOURCE,
      }));
    } catch {
      return [];
    }
  }

  async fetchNews(): Promise<ConnectorNewsItem[]> {
    // SEC EDGAR is a filings source, not a news source.
    return [];
  }
}
