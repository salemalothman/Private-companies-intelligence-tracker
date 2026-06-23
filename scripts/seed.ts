/**
 * Seed script — creates a demo user and a sample private portfolio.
 *
 * Run with:  npm run seed
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only secret).
 *
 * The service-role client bypasses RLS, so we set user_id explicitly.
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// supabase-js constructs a Realtime client that needs a global WebSocket.
// Node < 22 has none; polyfill it (we don't actually use realtime here).
if (!(globalThis as { WebSocket?: unknown }).WebSocket) {
  (globalThis as { WebSocket?: unknown }).WebSocket =
    WebSocket as unknown as typeof globalThis.WebSocket;
}

try {
  // Node >= 20.12 — load .env.local without a dependency.
  process.loadEnvFile(".env.local");
} catch {
  // env may already be present in the environment
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const DEMO_EMAIL = "demo@portfolio.app";
const DEMO_PASSWORD = "demo123456";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeedCompany {
  name: string;
  website: string;
  sector: string;
  country: string;
  founded_year: number;
  founders: string[];
  description: string;
  investment: {
    investment_date: string;
    amount: number;
    share_price: number;
    shares: number;
    ownership_pct: number;
    round: string;
    investor_name: string;
  };
  valuations: {
    date: string;
    round: string;
    post_money: number;
    pre_money?: number;
    share_price?: number;
    confidence: "low" | "medium" | "high";
    source: string;
  }[];
  rounds: {
    round: string;
    date: string;
    amount_raised: number;
    valuation: number;
    investors: string[];
    lead_investor: string;
    source: string;
  }[];
  news?: {
    title: string;
    source: string;
    date: string;
    sentiment: "positive" | "neutral" | "negative";
    summary: string;
  }[];
  // Deal-specific fee overrides (null/undefined = inherit the fund default).
  carry_pct?: number;
  mgmt_fee_pct?: number;
}

function defaultNews(c: SeedCompany) {
  const latest = c.rounds[c.rounds.length - 1];
  const items = [
    {
      title: `${c.name} raises ${latest.round} at $${(
        latest.valuation / 1e9
      ).toFixed(0)}B valuation`,
      source: latest.source,
      date: latest.date,
      sentiment: "positive" as const,
      summary: `${c.name} closed its ${latest.round} led by ${latest.lead_investor}.`,
    },
    {
      title: `${c.name} expands ${c.sector} product line`,
      source: "Company Blog",
      date: "2025-04-15",
      sentiment: "neutral" as const,
      summary: `${c.name} announced new offerings as it scales.`,
    },
  ];
  return c.news ?? items;
}

const COMPANIES: SeedCompany[] = [
  {
    name: "OpenAI",
    website: "https://openai.com",
    sector: "AI",
    country: "United States",
    founded_year: 2015,
    carry_pct: 25,
    mgmt_fee_pct: 8,
    founders: ["Sam Altman", "Greg Brockman", "Ilya Sutskever"],
    description:
      "Artificial intelligence research and deployment company behind ChatGPT and GPT-4.",
    investment: {
      investment_date: "2023-04-01",
      amount: 500_000,
      share_price: 25,
      shares: 20_000,
      ownership_pct: 0.05,
      round: "Secondary",
      investor_name: "Demo Capital SPV",
    },
    valuations: [
      { date: "2023-01-01", round: "Series Seed", post_money: 29_000_000_000, confidence: "high", source: "News" },
      { date: "2024-01-01", round: "Tender", post_money: 86_000_000_000, confidence: "high", source: "Press" },
      { date: "2025-01-01", round: "Series F", post_money: 157_000_000_000, confidence: "high", source: "News" },
    ],
    rounds: [
      { round: "Series F", date: "2024-10-01", amount_raised: 6_600_000_000, valuation: 157_000_000_000, investors: ["Thrive Capital", "Microsoft", "Nvidia"], lead_investor: "Thrive Capital", source: "TechCrunch" },
    ],
  },
  {
    name: "Anthropic",
    website: "https://anthropic.com",
    sector: "AI",
    country: "United States",
    founded_year: 2021,
    founders: ["Dario Amodei", "Daniela Amodei"],
    description: "AI safety company and creator of the Claude family of models.",
    investment: {
      investment_date: "2023-06-15",
      amount: 750_000,
      share_price: 18,
      shares: 41_666,
      ownership_pct: 0.04,
      round: "Series C",
      investor_name: "Demo Capital SPV",
    },
    valuations: [
      { date: "2023-05-01", round: "Series C", post_money: 4_100_000_000, confidence: "high", source: "News" },
      { date: "2024-01-01", round: "Series D", post_money: 18_000_000_000, confidence: "high", source: "News" },
      { date: "2025-03-01", round: "Series E", post_money: 61_500_000_000, confidence: "high", source: "Press" },
    ],
    rounds: [
      { round: "Series E", date: "2025-03-01", amount_raised: 3_500_000_000, valuation: 61_500_000_000, investors: ["Lightspeed", "Google", "Salesforce"], lead_investor: "Lightspeed", source: "Reuters" },
    ],
  },
  {
    name: "Stripe",
    website: "https://stripe.com",
    sector: "Fintech",
    country: "United States",
    founded_year: 2010,
    founders: ["Patrick Collison", "John Collison"],
    description: "Payments infrastructure for the internet.",
    investment: {
      investment_date: "2021-03-01",
      amount: 1_000_000,
      share_price: 40,
      shares: 25_000,
      ownership_pct: 0.02,
      round: "Series H",
      investor_name: "Demo Capital SPV",
    },
    valuations: [
      { date: "2021-03-01", round: "Series H", post_money: 95_000_000_000, confidence: "high", source: "News" },
      { date: "2023-03-01", round: "Series I", post_money: 50_000_000_000, confidence: "high", source: "News" },
      { date: "2025-02-01", round: "Tender", post_money: 91_500_000_000, confidence: "medium", source: "Press" },
    ],
    rounds: [
      { round: "Series I", date: "2023-03-15", amount_raised: 6_500_000_000, valuation: 50_000_000_000, investors: ["Andreessen Horowitz", "Founders Fund", "General Catalyst"], lead_investor: "Founders Fund", source: "Bloomberg" },
    ],
  },
  {
    name: "Databricks",
    website: "https://databricks.com",
    sector: "Data / AI",
    country: "United States",
    founded_year: 2013,
    founders: ["Ali Ghodsi", "Matei Zaharia"],
    description: "Data and AI platform unifying analytics and machine learning (lakehouse).",
    investment: {
      investment_date: "2023-09-01",
      amount: 600_000,
      share_price: 73,
      shares: 8_219,
      ownership_pct: 0.015,
      round: "Series I",
      investor_name: "Demo Capital SPV",
    },
    valuations: [
      { date: "2021-08-01", round: "Series H", post_money: 38_000_000_000, confidence: "high", source: "News" },
      { date: "2023-09-01", round: "Series I", post_money: 43_000_000_000, confidence: "high", source: "News" },
      { date: "2024-12-01", round: "Series J", post_money: 62_000_000_000, confidence: "high", source: "Press" },
    ],
    rounds: [
      { round: "Series J", date: "2024-12-01", amount_raised: 10_000_000_000, valuation: 62_000_000_000, investors: ["Thrive Capital", "a16z", "DST Global"], lead_investor: "Thrive Capital", source: "CNBC" },
    ],
  },
  {
    name: "Ramp",
    website: "https://ramp.com",
    sector: "Fintech",
    country: "United States",
    founded_year: 2019,
    carry_pct: 15,
    mgmt_fee_pct: 5,
    founders: ["Eric Glyman", "Karim Atiyeh"],
    description: "Corporate cards and spend management platform.",
    investment: {
      investment_date: "2024-04-01",
      amount: 300_000,
      share_price: 12,
      shares: 25_000,
      ownership_pct: 0.03,
      round: "Series D",
      investor_name: "Demo Capital SPV",
    },
    valuations: [
      { date: "2023-08-01", round: "Series C", post_money: 5_800_000_000, confidence: "medium", source: "News" },
      { date: "2024-04-01", round: "Series D", post_money: 7_650_000_000, confidence: "high", source: "News" },
      { date: "2025-01-01", round: "Series D-2", post_money: 13_000_000_000, confidence: "high", source: "Press" },
    ],
    rounds: [
      { round: "Series D-2", date: "2025-01-01", amount_raised: 150_000_000, valuation: 13_000_000_000, investors: ["Founders Fund", "Thrive Capital", "Khosla Ventures"], lead_investor: "Founders Fund", source: "TechCrunch" },
    ],
  },
];

async function getOrCreateDemoUser(): Promise<string> {
  // Try to create; if already exists, look it up.
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Demo Investor" },
  });
  if (data?.user) return data.user.id;

  if (error && !/already.*registered|exists/i.test(error.message)) {
    throw error;
  }
  // Find the existing user.
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === DEMO_EMAIL);
  if (!existing) throw new Error("Could not create or find demo user.");
  return existing.id;
}

async function main() {
  console.log("→ Creating demo user…");
  const userId = await getOrCreateDemoUser();
  console.log(`   demo user id: ${userId}`);

  // Reset prior demo data (cascade deletes children).
  await admin.from("companies").delete().eq("user_id", userId);

  for (const c of COMPANIES) {
    const { data: company, error } = await admin
      .from("companies")
      .insert({
        user_id: userId,
        name: c.name,
        website: c.website,
        sector: c.sector,
        country: c.country,
        founded_year: c.founded_year,
        founders: c.founders,
        description: c.description,
        status: "active",
        carry_pct: c.carry_pct ?? null,
        mgmt_fee_pct: c.mgmt_fee_pct ?? null,
      })
      .select("id")
      .single();
    if (error || !company) throw error;

    await admin.from("investments").insert({
      company_id: company.id,
      user_id: userId,
      ...c.investment,
    });

    await admin.from("valuations").insert(
      c.valuations.map((v) => ({ company_id: company.id, ...v })),
    );

    await admin.from("funding_rounds").insert(
      c.rounds.map((r) => ({ company_id: company.id, ...r })),
    );

    await admin.from("news").insert(
      defaultNews(c).map((n) => ({ company_id: company.id, ...n })),
    );

    console.log(`   ✓ seeded ${c.name}`);
  }

  console.log("\n✅ Seed complete.");
  console.log(`   Login:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
