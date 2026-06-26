/**
 * Live connector test for a single company.
 *
 *   npx tsx scripts/test-connectors.ts [Company Name]
 *
 * Exercises the Grok (xAI X-search) and SEC EDGAR (Form D) connectors end to end:
 * runs the real `x_search` tool + Zod-structured extraction and prints the parsed
 * output. Requires XAI_API_KEY and SEC_USER_AGENT in .env.local.
 */
export {}; // make this file a module (isolated scope)

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may already be present */
}

const COMPANY = process.argv[2] ?? "Replit";

async function main() {
  // Loaded after env so the providers read the keys lazily at call time.
  const { GrokConnector } = await import("../lib/connectors/grok");
  const { SecEdgarConnector } = await import("../lib/connectors/sec-edgar");

  console.log("Target company:", COMPANY);
  console.log("XAI_API_KEY set:", !!process.env.XAI_API_KEY);
  console.log("SEC_USER_AGENT:", process.env.SEC_USER_AGENT ?? "(missing)");

  // ---- Grok — xAI Grok with native X search ----
  const grok = new GrokConnector();
  console.log("\n========== GROK (x_search) ==========");

  console.log("\n--- fetchCompanyProfile ---");
  console.dir(await grok.fetchCompanyProfile(COMPANY), { depth: null });

  console.log("\n--- fetchFundingRounds (funding history + valuation) ---");
  console.dir(await grok.fetchFundingRounds(COMPANY), { depth: null });

  console.log("\n--- fetchNews (recent news + sentiment) ---");
  console.dir(await grok.fetchNews(COMPANY), { depth: null });

  // ---- SEC EDGAR — Form D private fundraising filings ----
  const sec = new SecEdgarConnector();
  console.log("\n========== SEC EDGAR (Form D) ==========");

  console.log("\n--- fetchFundingRounds ---");
  console.dir(await sec.fetchFundingRounds(COMPANY), { depth: null });

  console.log("\n--- fetchCompanyProfile ---");
  console.dir(await sec.fetchCompanyProfile(COMPANY), { depth: null });

  console.log("\n✅ done.");
}

main().catch((e) => {
  console.error("test failed:", e);
  process.exit(1);
});
