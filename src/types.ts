export interface CompanySearchResult {
  id: string; // screener internal company id
  name: string;
  url: string; // relative path, e.g. /company/TCS/consolidated/
}

export interface RatioItem {
  name: string;
  value: string;
}

export interface FinancialTable {
  section: string; // e.g. "Quarterly Results", "Profit & Loss"
  periods: string[]; // column headers, e.g. ["Mar 2023", "Mar 2024", ...]
  rows: { label: string; values: string[] }[];
}

export interface CompanyOverview {
  name: string;
  screenerUrl: string;
  aboutText: string | null;
  topRatios: RatioItem[];
  pros: string[];
  cons: string[];
}

export interface PeerRow {
  name: string;
  values: Record<string, string>;
}

export interface PeerComparison {
  columns: string[];
  peers: PeerRow[];
}

export interface ScreenResultRow {
  name: string;
  values: Record<string, string>;
}

export interface ScreenResult {
  columns: string[];
  rows: ScreenResultRow[];
  totalFound: number | null;
  truncated: boolean;
}

export type StatementType =
  | "quarters"
  | "profit-loss"
  | "balance-sheet"
  | "cash-flow"
  | "ratios";
