import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetTechnicalIndicatorInputSchema } from "../schemas/index.js";
import { getPriceHistory } from "../services/yahoo.js";
import { computeIndicator } from "../services/indicators.js";
import { ScreenerRequestError } from "../services/http.js";
import { markdownTable, truncateText } from "../services/format.js";

export function registerTechnicalIndicatorTool(server: McpServer): void {
  server.registerTool(
    "technical_get_indicator",
    {
      title: "Get Technical Indicator (RSI/SMA/EMA/MACD) for an Indian Stock",
      description: `Compute a price-based technical indicator — RSI, SMA, EMA, or MACD — for an NSE/BSE-listed stock. For a LIVE reading, use an intraday interval (default: 15minute) — the most recent candle reflects the current, still-forming period during market hours (9:15 AM–3:30 PM IST), so the top result is your "right now" value. Use daily/weekly/monthly for longer-term/end-of-day analysis instead. Historical close prices come from Yahoo Finance's public chart data (ticker + .NS/.BO suffix) and the indicator is computed server-side using standard formulas (Wilder's RSI, standard SMA/EMA, 12/26/9 MACD).

This is separate from the screener_* tools, which cover fundamentals only; use this for momentum/trend signals like "is this stock overbought right now" or "has it crossed its 200-day moving average."

Args:
  - ticker (string): Plain ticker, e.g. "TCS", "RITES" (no exchange prefix or suffix).
  - exchange (enum, default NSE): "NSE" or "BSE".
  - indicator (enum): "RSI", "SMA", "EMA", or "MACD".
  - interval (enum, default "15minute"): "1minute", "5minute", "15minute", "30minute", "60minute" for live/intraday readings, or "daily", "weekly", "monthly" for longer-term analysis.
  - time_period (number, default 14): Periods used in the calculation (e.g. 14 for standard RSI, 50/200 for common moving averages on daily+ intervals). Ignored for MACD (fixed 12/26/9).
  - limit (number, default 10, max 50): How many recent data points to return, newest first (the first one is the current/live value).

Returns:
  JSON: { "symbol": string, "indicator": string, "interval": string, "points": [{ "date": string, "values": {...} }] }
  Intraday dates are shown in IST (Indian Standard Time).

Examples:
  - Use when: "What's TCS's RSI right now?" -> ticker="TCS", indicator="RSI" (uses default live 15minute interval)
  - Use when: "Has RITES crossed its 200-day moving average?" -> ticker="RITES", indicator="SMA", time_period=200, interval="daily"
  - Don't use when: You want P/E, ROE, or other fundamentals (use screener_get_company_overview instead)

Error Handling:
  - Returns an error if the ticker/exchange combination isn't found on Yahoo Finance — double-check NSE vs BSE and the ticker spelling.
  - Returns an error if there isn't enough price history yet for the requested time_period (e.g. a recently listed stock and a 200-period SMA, or a long time_period on a short intraday window).
  - Outside market hours (or on non-trading days), the "live" value is simply the last traded candle, not a real-time price.`,
      inputSchema: GetTechnicalIndicatorInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ticker, exchange, indicator, interval, time_period, limit }) => {
      try {
        const series = await getPriceHistory(ticker, exchange, interval);
        const points = computeIndicator(series.dates, series.closes, indicator, time_period, limit);

        if (points.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Not enough price history for ${series.symbol} to compute ${indicator} with time_period=${time_period}. Try a shorter time_period or a different interval.`,
              },
            ],
          };
        }

        const valueKeys = Object.keys(points[0]!.values);
        const headers = ["Date", ...valueKeys];
        const rows = points.map((p) => [p.date, ...valueKeys.map((k) => p.values[k] ?? "")]);

        const text = truncateText(
          `## ${indicator} — ${series.symbol} (${interval})\n\n${markdownTable(headers, rows)}`
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            symbol: series.symbol,
            indicator,
            interval,
            points,
          } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof ScreenerRequestError ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
