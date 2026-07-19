export const BASE_URL = "https://www.screener.in";

// Screener.in has no official public API (they say so explicitly in their docs).
// This server reads the same public pages a signed-out browser would see.
// Be a good citizen: cache aggressively and rate-limit outgoing requests.
export const REQUEST_TIMEOUT_MS = 15_000;
export const MIN_REQUEST_INTERVAL_MS = 600; // spacing between outgoing requests
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const CHARACTER_LIMIT = 25_000; // soft cap on text returned to the agent per tool call

export const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Optional: a logged-in session cookie unlocks more screen result rows and exports.
// Set SCREENER_SESSION_COOKIE to the raw `Cookie:` header value from a logged-in
// browser session (e.g. "csrftoken=...; sessionid=..."). Never required.
export const SESSION_COOKIE = process.env.SCREENER_SESSION_COOKIE || null;
