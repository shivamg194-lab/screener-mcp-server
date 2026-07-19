import axios from "axios";
import { ScreenerRequestError } from "./http.js";

const NSE_BASE_URL = "https://www.nseindia.com";
const SESSION_TTL_MS = 4 * 60 * 1000; // NSE sessions are short-lived; refresh proactively

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

interface NseSession {
  cookie: string;
  expiresAt: number;
}

let cachedSession: NseSession | null = null;
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 350; // stay comfortably under NSE's ~3 req/sec limit

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/**
 * NSE's API rejects cold requests with 401 — it requires cookies obtained by first
 * loading the site like a browser would. This fetches and caches that session.
 */
async function getSession(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedSession && cachedSession.expiresAt > Date.now()) {
    return cachedSession.cookie;
  }

  await throttle();
  const response = await axios.get(NSE_BASE_URL, {
    headers: BROWSER_HEADERS,
    timeout: 15_000,
    validateStatus: () => true,
  });

  const setCookieHeaders = response.headers["set-cookie"];
  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    throw new ScreenerRequestError(
      "Couldn't establish a session with NSE (no cookies returned). NSE's anti-bot protection may be blocking this server right now — try again shortly."
    );
  }

  const cookie = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
  cachedSession = { cookie, expiresAt: Date.now() + SESSION_TTL_MS };
  return cookie;
}

/** Fetches a JSON endpoint under nseindia.com/api/, refreshing the session once on 401. */
async function fetchNseJson<T>(path: string, referer: string): Promise<T> {
  let cookie = await getSession();

  for (let attempt = 0; attempt < 2; attempt++) {
    await throttle();
    const response = await axios.get<T>(`${NSE_BASE_URL}${path}`, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "application/json, text/plain, */*",
        Referer: referer,
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookie,
      },
      timeout: 15_000,
      validateStatus: () => true,
    });

    if (response.status === 200) return response.data;

    if (response.status === 401 && attempt === 0) {
      cookie = await getSession(true); // refresh and retry once
      continue;
    }

    if (response.status === 404) {
      throw new ScreenerRequestError(
        `NSE returned 404 for this request — double-check the ticker symbol is correct and currently listed on NSE.`
      );
    }
    throw new ScreenerRequestError(
      `NSE returned HTTP ${response.status}. Its anti-bot protection may be temporarily blocking this server — this is more common with NSE than other sources here, try again shortly.`
    );
  }

  throw new ScreenerRequestError("NSE kept rejecting the session after a retry. Try again in a moment.");
}

export interface NseQuote {
  symbol: string;
  companyName: string | null;
  lastPrice: number | null;
  change: number | null;
  pChange: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  previousClose: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  totalTradedVolume: number | null;
}

export async function getNseQuote(symbol: string): Promise<NseQuote> {
  const upper = symbol.toUpperCase();
  const data = await fetchNseJson<any>(
    `/api/quote-equity?symbol=${encodeURIComponent(upper)}`,
    `${NSE_BASE_URL}/get-quotes/equity?symbol=${encodeURIComponent(upper)}`
  );

  const priceInfo = data?.priceInfo ?? {};
  return {
    symbol: upper,
    companyName: data?.info?.companyName ?? null,
    lastPrice: priceInfo.lastPrice ?? null,
    change: priceInfo.change ?? null,
    pChange: priceInfo.pChange ?? null,
    open: priceInfo.open ?? null,
    dayHigh: priceInfo.intraDayHighLow?.max ?? null,
    dayLow: priceInfo.intraDayHighLow?.min ?? null,
    previousClose: priceInfo.previousClose ?? null,
    yearHigh: priceInfo.weekHighLow?.max ?? null,
    yearLow: priceInfo.weekHighLow?.min ?? null,
    totalTradedVolume: data?.marketDeptOrderBook?.tradeInfo?.totalTradedVolume ?? null,
  };
}

export interface NseAnnouncement {
  subject: string;
  date: string;
  attachmentUrl: string | null;
}

export async function getNseAnnouncements(symbol: string, limit: number): Promise<NseAnnouncement[]> {
  const upper = symbol.toUpperCase();
  const data = await fetchNseJson<any[]>(
    `/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(upper)}`,
    `${NSE_BASE_URL}/companies-listing/corporate-filings-announcements?symbol=${encodeURIComponent(upper)}`
  );

  if (!Array.isArray(data)) return [];
  return data.slice(0, limit).map((item) => ({
    subject: item.subject ?? item.desc ?? "Untitled announcement",
    date: item.an_dt ?? item.sort_date ?? item.attchmntDate ?? "",
    attachmentUrl: item.attchmntFile ?? null,
  }));
}

export interface NseCorporateAction {
  subject: string;
  exDate: string;
  recordDate: string | null;
}

export async function getNseCorporateActions(symbol: string, limit: number): Promise<NseCorporateAction[]> {
  const upper = symbol.toUpperCase();
  const data = await fetchNseJson<any[]>(
    `/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(upper)}`,
    `${NSE_BASE_URL}/companies-listing/corporate-filings-actions?symbol=${encodeURIComponent(upper)}`
  );

  if (!Array.isArray(data)) return [];
  return data.slice(0, limit).map((item) => ({
    subject: item.subject ?? item.purpose ?? "Untitled action",
    exDate: item.exDate ?? "",
    recordDate: item.recDate ?? null,
  }));
}
