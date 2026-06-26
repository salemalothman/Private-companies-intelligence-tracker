import type {
  ConnectorCompanyProfile,
  ConnectorFundingRound,
  ConnectorNewsItem,
  ConnectorSocialSignal,
} from "@/lib/connectors/types";

export interface ConnectorBatchResult {
  source: string;
  profile: ConnectorCompanyProfile | null;
  rounds: ConnectorFundingRound[];
  news: ConnectorNewsItem[];
  /** Funding/partnership/valuation events audited from X accounts (optional). */
  signals?: ConnectorSocialSignal[];
}

export interface MappedIngest {
  fundingRounds: ConnectorFundingRound[];
  valuations: {
    date: string;
    post_money: number;
    round: string | null;
    source: string;
  }[];
  news: ConnectorNewsItem[];
  profilePatch: Partial<ConnectorCompanyProfile>;
}

const firstDefined = <T>(...vals: (T | null | undefined)[]): T | undefined =>
  vals.find((v) => v !== null && v !== undefined && v !== "") ?? undefined;

/**
 * Pure: aggregate + dedupe connector results into DB-ready shapes.
 * Funding rounds dedupe by round name; valuations by date+round; news by title.
 * A valuation point is synthesized from each round that has a date + valuation,
 * so the valuation timeline and MOIC populate automatically.
 */
export function mapConnectorResults(
  batch: ConnectorBatchResult[],
): MappedIngest {
  const roundsByKey = new Map<string, ConnectorFundingRound>();
  const valByKey = new Map<string, MappedIngest["valuations"][number]>();
  const newsByKey = new Map<string, ConnectorNewsItem>();

  for (const r of batch) {
    for (const round of r.rounds) {
      const key = round.round.trim().toLowerCase();
      if (!roundsByKey.has(key)) roundsByKey.set(key, round);
      if (round.date && round.valuation != null) {
        const vkey = `${round.date}|${key}`;
        if (!valByKey.has(vkey)) {
          valByKey.set(vkey, {
            date: round.date,
            post_money: round.valuation,
            round: round.round,
            source: round.source,
          });
        }
      }
    }
    for (const n of r.news) {
      const key = n.title.trim().toLowerCase();
      if (!newsByKey.has(key)) newsByKey.set(key, n);
    }
    // Social-audit signals feed the same tables: every event becomes a news
    // item; events with a valuation/raise also become a funding round (which in
    // turn synthesizes a valuation timeline point).
    for (const s of r.signals ?? []) {
      const nkey = s.title.trim().toLowerCase();
      if (!newsByKey.has(nkey)) {
        newsByKey.set(nkey, {
          title: s.title,
          source: s.handle ? `${s.source} (${s.handle})` : s.source,
          url: s.url,
          date: s.date,
          summary: s.summary,
          sentiment: s.sentiment,
        });
      }
      if (s.valuation != null || s.amountRaised != null || s.round) {
        const round = s.round ?? (s.kind === "valuation" ? "Valuation update" : "Undisclosed");
        // Key by round + date so distinct social events don't collapse together.
        const key = `${round.trim().toLowerCase()}|${s.date ?? ""}`;
        if (!roundsByKey.has(key)) {
          roundsByKey.set(key, {
            round,
            date: s.date,
            amountRaised: s.amountRaised,
            valuation: s.valuation,
            source: s.source,
          });
        }
        if (s.date && s.valuation != null) {
          const vkey = `${s.date}|${round.trim().toLowerCase()}`;
          if (!valByKey.has(vkey)) {
            valByKey.set(vkey, {
              date: s.date,
              post_money: s.valuation,
              round,
              source: s.source,
            });
          }
        }
      }
    }
  }

  const profiles = batch
    .map((b) => b.profile)
    .filter(Boolean) as ConnectorCompanyProfile[];
  const profilePatch: Partial<ConnectorCompanyProfile> = {
    website: firstDefined(...profiles.map((p) => p.website)),
    sector: firstDefined(...profiles.map((p) => p.sector)),
    country: firstDefined(...profiles.map((p) => p.country)),
    foundedYear: firstDefined(...profiles.map((p) => p.foundedYear)),
    description: firstDefined(...profiles.map((p) => p.description)),
    founders: firstDefined(...profiles.map((p) => p.founders)),
  };

  return {
    fundingRounds: [...roundsByKey.values()],
    valuations: [...valByKey.values()],
    news: [...newsByKey.values()],
    profilePatch,
  };
}
