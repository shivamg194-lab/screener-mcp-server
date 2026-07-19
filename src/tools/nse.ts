import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetNseQuoteInputSchema,
  GetNseAnnouncementsInputSchema,
  GetNseCorporateActionsInputSchema,
} from "../schemas/index.js";
import { getNseQuote, getNseAnnouncements, getNseCorporateActions } from "../services/nse.js";
import { ScreenerRequestError } from "../services/http.js";
import { markdownTable, truncateText } from "../services/format.js";

function nseErrorText(err: unknown): string {
  const message = err instanceof ScreenerRequestError ? err.message : String(err);
  return `Error: ${message}`;
}

export function registerNseQuoteTool(server: McpServer): void {
  server.registerTool(
    "nse_get_quote",
    {
      title: "Get Live NSE Quote",
      description: `Fetch a live quote directly from the NSE (National Stock Exchange of India) — last traded price, day range, 52-week range, previous close, and volume. This hits NSE's own site, the primary source, rather than a downstream aggregator.

Note: NSE's site has anti-bot protection and can occasionally reject requests or respond slowly (more so than the other tools in this server) — a transient error here usually means retrying in a few seconds fixes it.

Args:
  - symbol (string): Plain NSE ticker, e.g. "TCS", "RITES".

Returns:
  JSON: { symbol, companyName, lastPrice, change, pChange, open, dayHigh, dayLow, previousClose, yearHigh, yearLow, totalTradedVolume }

Examples:
  - Use when: "What's TCS trading at right now, straight from NSE?" -> symbol="TCS"

Error Handling:
  - Returns an error if NSE's session/anti-bot check fails — this is a known NSE quirk, retry.
  - Returns an error if the symbol isn't found — double-check spelling/listing status.`,
      inputSchema: GetNseQuoteInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ symbol }) => {
      try {
        const quote = await getNseQuote(symbol);
        const text = truncateText(
          `## ${quote.companyName ?? quote.symbol} (${quote.symbol}) — NSE Live Quote\n\n` +
            `- Last Price: ₹${quote.lastPrice ?? "—"}\n` +
            `- Change: ${quote.change ?? "—"} (${quote.pChange ?? "—"}%)\n` +
            `- Open: ₹${quote.open ?? "—"}\n` +
            `- Day Range: ₹${quote.dayLow ?? "—"} – ₹${quote.dayHigh ?? "—"}\n` +
            `- 52-Week Range: ₹${quote.yearLow ?? "—"} – ₹${quote.yearHigh ?? "—"}\n` +
            `- Previous Close: ₹${quote.previousClose ?? "—"}\n` +
            `- Volume: ${quote.totalTradedVolume ?? "—"}`
        );
        return { content: [{ type: "text", text }], structuredContent: quote as unknown as Record<string, unknown> };
      } catch (err) {
        return { content: [{ type: "text", text: nseErrorText(err) }], isError: true };
      }
    }
  );
}

export function registerNseAnnouncementsTool(server: McpServer): void {
  server.registerTool(
    "nse_get_announcements",
    {
      title: "Get NSE Corporate Announcements",
      description: `Fetch recent corporate announcements filed with NSE for a company — order wins, board meeting outcomes, management changes, and other regulatory filings. This is the primary source for "has this company announced anything recently" (e.g. new orders), which fundamentals-only tools can't surface.

Args:
  - symbol (string): Plain NSE ticker, e.g. "TCS", "RITES".
  - limit (number, default 10, max 30): How many recent announcements to return, newest first.

Returns:
  JSON: { results: [{ subject, date, attachmentUrl }] }

Examples:
  - Use when: "Has RITES announced any new orders recently?" -> symbol="RITES"
  - Don't use when: You want fundamentals or ratios (use screener_get_company_overview instead)

Error Handling:
  - Returns an error if NSE's session/anti-bot check fails — retry.
  - Returns an empty list if there's nothing recent for that symbol.`,
      inputSchema: GetNseAnnouncementsInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ symbol, limit }) => {
      try {
        const announcements = await getNseAnnouncements(symbol, limit);
        if (announcements.length === 0) {
          return { content: [{ type: "text", text: `No recent announcements found for ${symbol.toUpperCase()}.` }] };
        }
        const rows = announcements.map((a) => [a.date, a.subject]);
        const text = truncateText(
          `## Recent NSE Announcements — ${symbol.toUpperCase()}\n\n${markdownTable(["Date", "Subject"], rows)}`
        );
        return {
          content: [{ type: "text", text }],
          structuredContent: { results: announcements } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return { content: [{ type: "text", text: nseErrorText(err) }], isError: true };
      }
    }
  );
}

export function registerNseCorporateActionsTool(server: McpServer): void {
  server.registerTool(
    "nse_get_corporate_actions",
    {
      title: "Get NSE Corporate Actions",
      description: `Fetch recent/upcoming corporate actions filed with NSE for a company — dividends, buybacks, stock splits, bonuses, and their ex-dates/record dates. This is the primary source for "is there a buyback/dividend coming up," which fundamentals-only tools can't surface.

Args:
  - symbol (string): Plain NSE ticker, e.g. "TCS", "RITES".
  - limit (number, default 10, max 30): How many corporate actions to return.

Returns:
  JSON: { results: [{ subject, exDate, recordDate }] }

Examples:
  - Use when: "Is there a buyback coming up for RITES ahead of the record date?" -> symbol="RITES"
  - Don't use when: You want historical dividend yield (use screener_get_company_overview instead)

Error Handling:
  - Returns an error if NSE's session/anti-bot check fails — retry.
  - Returns an empty list if there's nothing on file for that symbol.`,
      inputSchema: GetNseCorporateActionsInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ symbol, limit }) => {
      try {
        const actions = await getNseCorporateActions(symbol, limit);
        if (actions.length === 0) {
          return { content: [{ type: "text", text: `No corporate actions found for ${symbol.toUpperCase()}.` }] };
        }
        const rows = actions.map((a) => [a.exDate, a.recordDate ?? "—", a.subject]);
        const text = truncateText(
          `## NSE Corporate Actions — ${symbol.toUpperCase()}\n\n${markdownTable(["Ex-Date", "Record Date", "Subject"], rows)}`
        );
        return {
          content: [{ type: "text", text }],
          structuredContent: { results: actions } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return { content: [{ type: "text", text: nseErrorText(err) }], isError: true };
      }
    }
  );
}
