/**
 * Database types for the Private Portfolio Intelligence Tracker.
 * Hand-maintained to match supabase/migrations. Can be regenerated with
 * `supabase gen types typescript`.
 *
 * Each table's Row/Insert are standalone interfaces (no self-referential
 * Database[...] lookups) so TypeScript can resolve the schema cleanly.
 */

export type Confidence = "low" | "medium" | "high";
export type CompanyStatus = "active" | "exited";
export type Sentiment = "positive" | "neutral" | "negative";

type Empty = { [_ in never]: never };

// --- profiles ---
export type ProfileRow = {
  id: string;
  full_name: string | null;
  created_at: string;
}
type ProfileInsert = {
  id: string;
  full_name?: string | null;
  created_at?: string;
}

// --- companies ---
export type CompanyRow = {
  id: string;
  user_id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  sector: string | null;
  country: string | null;
  founded_year: number | null;
  founders: string[] | null;
  description: string | null;
  status: CompanyStatus;
  risk_score: number | null;
  realized_proceeds: number;
  carry_pct: number | null;
  mgmt_fee_pct: number | null;
  created_at: string;
  updated_at: string;
}
type CompanyInsert = {
  id?: string;
  user_id?: string;
  name: string;
  website?: string | null;
  logo_url?: string | null;
  sector?: string | null;
  country?: string | null;
  founded_year?: number | null;
  founders?: string[] | null;
  description?: string | null;
  status?: CompanyStatus;
  risk_score?: number | null;
  realized_proceeds?: number;
  carry_pct?: number | null;
  mgmt_fee_pct?: number | null;
}

// --- ingestion_runs ---
export type IngestionRunRow = {
  id: string;
  company_id: string | null;
  user_id: string;
  source: string;
  status: string;
  items_found: number;
  detail: string | null;
  created_at: string;
};
type IngestionRunInsert = {
  id?: string;
  company_id?: string | null;
  user_id?: string;
  source: string;
  status?: string;
  items_found?: number;
  detail?: string | null;
};

// --- investments ---
export type InvestmentRow = {
  id: string;
  company_id: string;
  user_id: string;
  investment_date: string;
  amount: number;
  share_price: number | null;
  shares: number | null;
  ownership_pct: number | null;
  investor_name: string | null;
  round: string | null;
  terms: string | null;
  notes: string | null;
  created_at: string;
}
type InvestmentInsert = {
  id?: string;
  company_id: string;
  user_id?: string;
  investment_date: string;
  amount?: number;
  share_price?: number | null;
  shares?: number | null;
  ownership_pct?: number | null;
  investor_name?: string | null;
  round?: string | null;
  terms?: string | null;
  notes?: string | null;
}

// --- valuations ---
export type ValuationRow = {
  id: string;
  company_id: string;
  date: string;
  round: string | null;
  pre_money: number | null;
  post_money: number | null;
  share_price: number | null;
  source: string | null;
  confidence: Confidence;
  created_at: string;
}
type ValuationInsert = {
  id?: string;
  company_id: string;
  date: string;
  round?: string | null;
  pre_money?: number | null;
  post_money?: number | null;
  share_price?: number | null;
  source?: string | null;
  confidence?: Confidence;
}

// --- funding_rounds ---
export type FundingRoundRow = {
  id: string;
  company_id: string;
  round: string;
  date: string | null;
  amount_raised: number | null;
  valuation: number | null;
  investors: string[] | null;
  lead_investor: string | null;
  share_price: number | null;
  source: string | null;
  created_at: string;
}
type FundingRoundInsert = {
  id?: string;
  company_id: string;
  round: string;
  date?: string | null;
  amount_raised?: number | null;
  valuation?: number | null;
  investors?: string[] | null;
  lead_investor?: string | null;
  share_price?: number | null;
  source?: string | null;
}

// --- news ---
export type NewsRow = {
  id: string;
  company_id: string;
  title: string;
  source: string | null;
  url: string | null;
  date: string | null;
  sentiment: Sentiment | null;
  summary: string | null;
  category: string | null;
  created_at: string;
}
type NewsInsert = {
  id?: string;
  company_id: string;
  title: string;
  source?: string | null;
  url?: string | null;
  date?: string | null;
  sentiment?: Sentiment | null;
  summary?: string | null;
  category?: string | null;
}

// --- documents ---
export type DocumentRowDb = {
  id: string;
  company_id: string;
  user_id: string;
  file_path: string;
  type: string | null;
  extracted_data: Record<string, unknown> | null;
  status: string;
  created_at: string;
};
type DocumentInsert = {
  id?: string;
  company_id: string;
  user_id?: string;
  file_path: string;
  type?: string | null;
  extracted_data?: Record<string, unknown> | null;
  status?: string;
}

// --- competitors ---
export type CompetitorRow = {
  id: string;
  company_id: string;
  user_id: string;
  name: string;
  valuation: number | null;
  valuation_date: string | null;
  revenue: number | null;
  revenue_basis: string | null;
  source: string | null;
  basis: string | null;
  sec_verified: boolean;
  is_self: boolean;
  created_at: string;
  updated_at: string;
};
type CompetitorInsert = {
  id?: string;
  company_id: string;
  user_id?: string;
  name: string;
  valuation?: number | null;
  valuation_date?: string | null;
  revenue?: number | null;
  revenue_basis?: string | null;
  source?: string | null;
  basis?: string | null;
  sec_verified?: boolean;
  is_self?: boolean;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: Partial<ProfileInsert>;
        Relationships: [];
      };
      companies: {
        Row: CompanyRow;
        Insert: CompanyInsert;
        Update: Partial<CompanyInsert>;
        Relationships: [];
      };
      investments: {
        Row: InvestmentRow;
        Insert: InvestmentInsert;
        Update: Partial<InvestmentInsert>;
        Relationships: [];
      };
      valuations: {
        Row: ValuationRow;
        Insert: ValuationInsert;
        Update: Partial<ValuationInsert>;
        Relationships: [];
      };
      funding_rounds: {
        Row: FundingRoundRow;
        Insert: FundingRoundInsert;
        Update: Partial<FundingRoundInsert>;
        Relationships: [];
      };
      news: {
        Row: NewsRow;
        Insert: NewsInsert;
        Update: Partial<NewsInsert>;
        Relationships: [];
      };
      documents: {
        Row: DocumentRowDb;
        Insert: DocumentInsert;
        Update: Partial<DocumentInsert>;
        Relationships: [];
      };
      ingestion_runs: {
        Row: IngestionRunRow;
        Insert: IngestionRunInsert;
        Update: Partial<IngestionRunInsert>;
        Relationships: [];
      };
      competitors: {
        Row: CompetitorRow;
        Insert: CompetitorInsert;
        Update: Partial<CompetitorInsert>;
        Relationships: [];
      };
    };
    Views: Empty;
    Functions: Empty;
    Enums: Empty;
    CompositeTypes: Empty;
  };
}

// Convenience row aliases
export type Company = CompanyRow;
export type Investment = InvestmentRow;
export type Valuation = ValuationRow;
export type FundingRound = FundingRoundRow;
export type NewsItem = NewsRow;
export type DocumentRow = DocumentRowDb;
export type IngestionRun = IngestionRunRow;
export type Competitor = CompetitorRow;

/** A company joined with its related records — the shape the UI consumes. */
export interface CompanyWithRelations extends CompanyRow {
  investments: InvestmentRow[];
  valuations: ValuationRow[];
  funding_rounds: FundingRoundRow[];
  news: NewsRow[];
}
