# screener-mcp-server

An MCP server for [Screener.in](https://www.screener.in) — search Indian listed companies, pull key ratios, multi-year financial statements, peer comparisons, and run custom fundamental screens, all from Claude (or any MCP client).

## Important: no official API

Screener.in [explicitly states they don't provide an API](https://support.screener.in/article/28-export-screen-results) — only CSV export from the UI. This server works by reading the same public, signed-out pages a browser would see (search, company pages, and the `/screen/raw/` query endpoint). It does **not** require login for the core tools.

Because this isn't an official API:
- Please keep request volume reasonable — the server throttles and caches requests for you (5 min cache, ~600ms min gap between requests), don't work around that.
- Guest (logged-out) access to custom screens is capped by Screener to a small number of result rows. If you want more rows or CSV-export-only data, set `SCREENER_SESSION_COOKIE` (see below) to a cookie from your own logged-in session.
- Screener's HTML structure can change without notice; if a tool starts erroring, the CSS selectors in `src/services/scraper.ts` likely need a small update.
- Review [Screener's Terms](https://www.screener.in/guides/terms/) before heavy or commercial use.

## Tools

| Tool | What it does |
|---|---|
| `screener_search_companies` | Look up a company's Screener ID/URL by name or ticker |
| `screener_get_company_overview` | Key ratios (Market Cap, P/E, ROE, ROCE, etc.), About text, Pros/Cons |
| `screener_get_financial_statement` | Quarterly results, P&L, balance sheet, cash flow, or ratios — multi-year table |
| `screener_get_peer_comparison` | The peer-comparison table shown on a company's page |
| `screener_run_custom_screen` | Run a Screener query-builder screen (e.g. `Market Capitalization > 500 AND Return on equity > 22`) across the whole market |
| `technical_get_indicator` | RSI, SMA, EMA, or MACD for an NSE/BSE stock, via Alpha Vantage |

### Why compute indicators ourselves instead of using Groww or Alpha Vantage?

- Groww's official MCP (`mcp.groww.in`) is account-linked via OAuth (it's built to read *your* portfolio/trades). Folding it into this server would mean building a full OAuth pass-through proxy — a much bigger project, and unnecessary for public technicals like RSI.
- Alpha Vantage's NSE/BSE coverage (`NSE:TICKER` format) turned out to be unreliable in practice — it often only returns NASDAQ data despite documentation claiming Indian exchange support.

Instead, `technical_get_indicator` pulls raw historical close prices from Yahoo Finance's public chart endpoint (ticker + `.NS`/`.BO` suffix — the same data source most community NSE tooling, like `yfinance`, relies on) and computes RSI (Wilder's method), SMA, EMA, and MACD (12/26/9) server-side using standard formulas. No API key, no OAuth, no external rate limits — just one more tool in the same connector.

Since this is an unofficial-but-widely-used endpoint (not a documented Yahoo API), if it ever breaks, check `src/services/yahoo.ts` — the fix is usually just adjusting the URL or response shape to match Yahoo's current chart endpoint.

## Setup

```bash
npm install
npm run build
```

### Run locally (stdio) — for Claude Desktop / Claude Code

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "screener": {
      "command": "node",
      "args": ["/absolute/path/to/screener-mcp-server/dist/index.js"]
    }
  }
}
```

### Run as a remote HTTP server

```bash
TRANSPORT=http PORT=3000 npm start
```

Then point your MCP client at `http://localhost:3000/mcp`.

### Optional: logged-in session for more screen results

```bash
export SCREENER_SESSION_COOKIE="csrftoken=...; sessionid=..."
```

Grab this from your browser's DevTools → Network tab → any request to screener.in → `Cookie` request header, while logged into your own Screener account. Never share this value; it's your personal session.

## Development

```bash
npm run dev    # tsc --watch
```

If Screener changes their page markup and a tool starts failing, check the selectors in `src/services/scraper.ts` (`#top-ratios`, `.pros`/`.cons`, `#profit-loss`/`#balance-sheet`/etc. table sections, `#peers table`) against the current HTML.
