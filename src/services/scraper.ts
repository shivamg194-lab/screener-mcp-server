import * as cheerio from "cheerio";
import { BASE_URL } from "../constants.js";
import { fetchDom, fetchJson, ScreenerRequestError } from "./http.js";
import type {
  CompanyOverview,
  CompanySearchResult,
  FinancialTable,
  PeerComparison,
  PeerRow,
  RatioItem,
  ScreenResult,
  StatementType,
} from "../types.js";

const SECTION_IDS: Record<StatementType, string> = {
  quarters: "quarters",
  "profit-loss": "profit-loss",
  "balance-sheet": "balance-sheet",
  "cash-flow": "cash-flow",
  ratios: "ratios",
};

const SECTION_TITLES: Record<StatementType, string> = {
  quarters: "Quarterly Results",
  "profit-loss": "Profit & Loss",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flows",
  ratios: "Ratios",
};

function cleanText(s: string | undefined | null): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** Searches Screener's autocomplete endpoint for companies matching a name/ticker. */
export async function searchCompanies(query: string): Promise<CompanySearchResult[]> {
  const url = `${BASE_URL}/api/company/search/?q=${encodeURIComponent(query)}`;
  const results = await fetchJson<Array<{ id: number | string; name: string; url: string }>>(url);
  if (!Array.isArray(results)) return [];
  return results.map((r) => ({ id: String(r.id), name: r.name, url: r.url }));
}

/** Resolves a user-supplied ticker/company name/slug to a company page path. */
async function resolveCompanyPath(identifier: string, consolidated: boolean): Promise<string> {
  const trimmed = identifier.trim();

  // Already a full screener path or URL
  if (trimmed.startsWith("http") || trimmed.startsWith("/company/")) {
    const path = trimmed.startsWith("http") ? new URL(trimmed).pathname : trimmed;
    return path.endsWith("/") ? path : `${path}/`;
  }

  // Looks like a plain ticker symbol (all caps/digits, no spaces) — try it directly first.
  if (/^[A-Za-z0-9\-&]+$/.test(trimmed)) {
    const variant = consolidated ? "consolidated/" : "";
    return `/company/${trimmed.toUpperCase()}/${variant}`;
  }

  // Otherwise, resolve via search.
  const matches = await searchCompanies(trimmed);
  if (matches.length === 0) {
    throw new ScreenerRequestError(
      `No company found matching "${identifier}". Try screener_search_companies to find the right name/ticker first.`
    );
  }
  const best = matches[0]!;
  return best.url.endsWith("/") ? best.url : `${best.url}/`;
}

function parseTopRatios($: cheerio.CheerioAPI): RatioItem[] {
  const ratios: RatioItem[] = [];
  $("#top-ratios li").each((_, el) => {
    const $el = $(el);
    const name = cleanText($el.find(".name").first().text());
    // value = full text minus the name
    const fullText = cleanText($el.text());
    const value = cleanText(fullText.startsWith(name) ? fullText.slice(name.length) : fullText);
    if (name) ratios.push({ name, value });
  });
  return ratios;
}

function parseProsCons($: cheerio.CheerioAPI, selector: string): string[] {
  const items: string[] = [];
  $(`${selector} ul li`).each((_, el) => {
    const text = cleanText($(el).text());
    if (text) items.push(text);
  });
  return items;
}

function parseAbout($: cheerio.CheerioAPI): string | null {
  const candidates = [".company-profile .sub p", ".company-profile p", "#company-info p"];
  for (const sel of candidates) {
    const text = cleanText($(sel).first().text());
    if (text) return text;
  }
  return null;
}

/** Fetches the overview (top ratios, about text, pros/cons) for a company. */
export async function getCompanyOverview(
  identifier: string,
  consolidated = true
): Promise<CompanyOverview> {
  const path = await resolveCompanyPath(identifier, consolidated);
  const url = `${BASE_URL}${path}`;
  const $ = await fetchDom(url);

  const name = cleanText($("h1").first().text()) || identifier;

  return {
    name,
    screenerUrl: url,
    aboutText: parseAbout($),
    topRatios: parseTopRatios($),
    pros: parseProsCons($, ".pros"),
    cons: parseProsCons($, ".cons"),
  };
}

function parseFinancialTable($: cheerio.CheerioAPI, sectionId: string): {
  periods: string[];
  rows: { label: string; values: string[] }[];
} | null {
  const $section = $(`#${sectionId}`);
  if ($section.length === 0) return null;
  const $table = $section.find("table").first();
  if ($table.length === 0) return null;

  const periods: string[] = [];
  $table
    .find("thead th")
    .each((i, el) => {
      if (i === 0) return; // first header cell is blank / row-label column
      const text = cleanText($(el).text());
      if (text) periods.push(text);
    });

  const rows: { label: string; values: string[] }[] = [];
  $table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length === 0) return;
    const rawLabel = cleanText($(cells[0]).text());
    const label = rawLabel.replace(/\s*\+\s*$/, "").trim(); // strip expandable "+" marker
    if (!label) return;
    const values: string[] = [];
    cells.each((i, td) => {
      if (i === 0) return;
      values.push(cleanText($(td).text()));
    });
    rows.push({ label, values });
  });

  return { periods, rows };
}

/** Fetches one financial statement/table (quarters, P&L, balance sheet, cash flow, ratios). */
export async function getFinancialStatement(
  identifier: string,
  statement: StatementType,
  consolidated = true
): Promise<FinancialTable> {
  const path = await resolveCompanyPath(identifier, consolidated);
  const url = `${BASE_URL}${path}`;
  const $ = await fetchDom(url);

  const sectionId = SECTION_IDS[statement];
  const parsed = parseFinancialTable($, sectionId);
  if (!parsed || parsed.rows.length === 0) {
    throw new ScreenerRequestError(
      `Couldn't find "${SECTION_TITLES[statement]}" data on the Screener page for "${identifier}". The company may not report this statement, or Screener's page layout may have changed.`
    );
  }

  return {
    section: SECTION_TITLES[statement],
    periods: parsed.periods,
    rows: parsed.rows,
  };
}

/** Fetches the peer-comparison table shown on a company's page. */
export async function getPeerComparison(
  identifier: string,
  consolidated = true
): Promise<PeerComparison> {
  const path = await resolveCompanyPath(identifier, consolidated);
  const url = `${BASE_URL}${path}`;
  const $ = await fetchDom(url);

  const $table = $("#peers table").first();
  if ($table.length === 0) {
    throw new ScreenerRequestError(
      `Couldn't find a peer comparison table for "${identifier}". This can happen for standalone-only or delisted companies.`
    );
  }

  const columns: string[] = [];
  $table.find("thead th").each((_, el) => {
    columns.push(cleanText($(el).text()));
  });

  const peers: PeerRow[] = [];
  $table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length === 0) return;
    const name = cleanText($(cells[0]).text());
    if (!name || /^s\.?no\.?$/i.test(name)) return;
    const values: Record<string, string> = {};
    cells.each((i, td) => {
      const colName = columns[i] || `col_${i}`;
      values[colName] = cleanText($(td).text());
    });
    peers.push({ name, values });
  });

  return { columns, peers };
}

/**
 * Runs a Screener.in custom query screen (the same syntax as their query builder,
 * e.g. `Market Capitalization > 500 AND Return on equity > 22`) and parses the results table.
 * Without a logged-in session, Screener limits guest results to a small number of rows.
 */
export async function runCustomScreen(query: string, limit: number): Promise<ScreenResult> {
  const url = `${BASE_URL}/screen/raw/?sort=&order=&query=${encodeURIComponent(query)}`;
  const $ = await fetchDom(url);

  const errorText = cleanText($(".error, .alert-danger").first().text());
  if (errorText) {
    throw new ScreenerRequestError(`Screener rejected this query: ${errorText}`);
  }

  const $table = $("table.data-table").first().length
    ? $("table.data-table").first()
    : $("table").first();

  if ($table.length === 0) {
    return { columns: [], rows: [], totalFound: 0, truncated: false };
  }

  const columns: string[] = [];
  $table.find("thead th").each((_, el) => {
    columns.push(cleanText($(el).text()));
  });

  const allRows: { name: string; values: Record<string, string> }[] = [];
  $table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length === 0) return;
    const name = cleanText($(cells[1] ?? cells[0]).text()) || cleanText($(cells[0]).text());
    if (!name) return;
    const values: Record<string, string> = {};
    cells.each((i, td) => {
      const colName = columns[i] || `col_${i}`;
      values[colName] = cleanText($(td).text());
    });
    allRows.push({ name, values });
  });

  const totalFoundText = cleanText($("body").text().match(/([\d,]+)\s+results found/i)?.[1]);
  const totalFound = totalFoundText ? parseInt(totalFoundText.replace(/,/g, ""), 10) : null;

  const truncated = allRows.length > limit;
  return {
    columns,
    rows: allRows.slice(0, limit),
    totalFound,
    truncated,
  };
}
