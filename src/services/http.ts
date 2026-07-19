import axios, { AxiosError } from "axios";
import * as cheerio from "cheerio";
import {
  CACHE_TTL_MS,
  DEFAULT_HEADERS,
  MIN_REQUEST_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  SESSION_COOKIE,
} from "../constants.js";

interface CacheEntry {
  expiresAt: number;
  data: string;
}

const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

export class ScreenerRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string
  ) {
    super(message);
    this.name = "ScreenerRequestError";
  }
}

/**
 * Fetches a URL's raw response body as text, with a small in-memory cache
 * and request throttling so this server doesn't hammer screener.in.
 */
export async function fetchText(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  await throttle();

  try {
    const headers: Record<string, string> = { ...DEFAULT_HEADERS };
    if (SESSION_COOKIE) headers["Cookie"] = SESSION_COOKIE;

    const response = await axios.get<string>(url, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
      responseType: "text",
      validateStatus: () => true,
    });

    if (response.status === 429) {
      throw new ScreenerRequestError(
        "Screener.in rate-limited this request (HTTP 429). Wait a moment before retrying, and avoid firing many requests back to back.",
        429,
        url
      );
    }
    if (response.status === 404) {
      throw new ScreenerRequestError(
        `Screener.in returned 404 for ${url}. The company/query likely doesn't exist or the identifier is wrong — try screener_search_companies first.`,
        404,
        url
      );
    }
    if (response.status >= 400) {
      throw new ScreenerRequestError(
        `Screener.in returned HTTP ${response.status} for ${url}.`,
        response.status,
        url
      );
    }

    cache.set(url, { data: response.data, expiresAt: Date.now() + CACHE_TTL_MS });
    return response.data;
  } catch (err) {
    if (err instanceof ScreenerRequestError) throw err;
    if (err instanceof AxiosError) {
      if (err.code === "ECONNABORTED") {
        throw new ScreenerRequestError(`Request to ${url} timed out.`, undefined, url);
      }
      throw new ScreenerRequestError(
        `Network error fetching ${url}: ${err.message}`,
        err.response?.status,
        url
      );
    }
    throw err;
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ScreenerRequestError(`Expected JSON from ${url} but couldn't parse the response.`, undefined, url);
  }
}

export async function fetchDom(url: string): Promise<cheerio.CheerioAPI> {
  const html = await fetchText(url);
  return cheerio.load(html);
}
