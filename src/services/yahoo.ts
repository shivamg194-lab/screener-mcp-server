import { fetchJson, ScreenerRequestError } from "./http.js";

export type Exchange = "NSE" | "BSE";
export type Interval = "1minute" | "5minute" | "15minute" | "30minute" | "60minute" | "daily" | "weekly" | "monthly";

const INTERVAL_MAP: Record<Interval, string> = {
  "1minute": "1m",
  "5minute": "5m",
  "15minute": "15m",
  "30minute": "30m",
  "60minute": "60m",
  daily: "1d",
  weekly: "1wk",
  monthly: "1mo",
};

// Yahoo caps how far back intraday candles are available: 1m -> ~7 days, other
// intraday intervals -> ~60 days. Daily+ intervals get a longer window so
// long-period indicators (e.g. 200 SMA) have enough history to stabilize.
const RANGE_MAP: Record<Interval, string> = {
  "1minute": "5d",
  "5minute": "1mo",
  "15minute": "1mo",
  "30minute": "1mo",
  "60minute": "3mo",
  daily: "2y",
  weekly: "5y",
  monthly: "10y",
};

const INTRADAY_INTERVALS = new Set<Interval>(["1minute", "5minute", "15minute", "30minute", "60minute"]);
export function isIntraday(interval: Interval): boolean {
  return INTRADAY_INTERVALS.has(interval);
}

export interface PriceSeries {
  symbol: string;
  dates: string[]; // ISO date strings, oldest first
  closes: number[]; // aligned with dates
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

function exchangeSuffix(exchange: Exchange): string {
  return exchange === "NSE" ? ".NS" : ".BO";
}

/** Fetches daily/weekly/monthly close-price history for an NSE/BSE ticker from Yahoo Finance's chart endpoint. */
export async function getPriceHistory(
  ticker: string,
  exchange: Exchange,
  interval: Interval
): Promise<PriceSeries> {
  const symbol = `${ticker.toUpperCase()}${exchangeSuffix(exchange)}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${RANGE_MAP[interval]}&interval=${INTERVAL_MAP[interval]}`;

  const data = await fetchJson<YahooChartResponse>(url);

  if (data.chart.error) {
    throw new ScreenerRequestError(
      `Yahoo Finance couldn't find "${symbol}": ${data.chart.error.description}. Double-check the ticker and exchange (NSE vs BSE).`
    );
  }
  const result = data.chart.result?.[0];
  if (!result || !result.timestamp || result.timestamp.length === 0) {
    throw new ScreenerRequestError(`No price history returned for "${symbol}".`);
  }

  const closesRaw = result.indicators.quote[0]?.close ?? [];
  const dates: string[] = [];
  const closes: number[] = [];
  const intraday = isIntraday(interval);
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  result.timestamp.forEach((ts, i) => {
    const close = closesRaw[i];
    if (close === null || close === undefined) return; // skip holidays/gaps
    if (intraday) {
      const ist = new Date(ts * 1000 + IST_OFFSET_MS);
      dates.push(ist.toISOString().slice(0, 16).replace("T", " ") + " IST");
    } else {
      dates.push(new Date(ts * 1000).toISOString().slice(0, 10));
    }
    closes.push(close);
  });

  if (closes.length === 0) {
    throw new ScreenerRequestError(`No usable close-price data found for "${symbol}".`);
  }

  return { symbol, dates, closes };
}
