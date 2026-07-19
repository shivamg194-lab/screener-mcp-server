import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RunCustomScreenInputSchema } from "../schemas/index.js";
import { runCustomScreen } from "../services/scraper.js";
import { ScreenerRequestError } from "../services/http.js";
import { markdownTable, truncateText } from "../services/format.js";

export function registerCustomScreenTool(server: McpServer): void {
  server.registerTool(
    "screener_run_custom_screen",
    {
      title: "Run a Custom Stock Screen on Screener.in",
      description: `Run a custom stock screen using Screener.in's query-builder syntax against 10+ years of financial data for all listed Indian companies, and return the matching companies.

This is the core "screener" feature — filter the whole market by fundamental criteria in one call, instead of checking companies one by one.

Args:
  - query (string): Screener query syntax. Combine conditions with AND/OR. Examples:
      "Market Capitalization > 500 AND Return on capital employed > 22"
      "Price to Earning < 15 AND Debt to equity < 0.5 AND Sales growth 3Years > 10"
    Common fields: Market Capitalization, Current Price, Price to Earning, Return on equity,
    Return on capital employed, Debt to equity, Sales growth, Profit growth, Dividend yield, Book value, Promoter holding.
  - limit (number, 1-100, default 25): Max rows to return. Note: without a logged-in session (SCREENER_SESSION_COOKIE env var), Screener itself caps guest results to a small number regardless of this limit.

Returns:
  JSON: { "columns": string[], "rows": [{name, values}], "totalFound": number|null, "truncated": boolean }

Examples:
  - Use when: "Find small-cap companies with ROE > 20% and low debt" -> query="Market Capitalization < 5000 AND Return on equity > 20 AND Debt to equity < 0.3"
  - Don't use when: You want data for one specific known company (use screener_get_company_overview instead)

Error Handling:
  - Returns "Error: Screener rejected this query: ..." if the query syntax is invalid — check field names and operators.
  - If truncated=true and totalFound is much larger than what's returned, note that a logged-in session would unlock more rows.`,
      inputSchema: RunCustomScreenInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit }) => {
      try {
        const result = await runCustomScreen(query, limit);

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No companies matched this query: "${query}". Double-check field names/operators, or loosen the thresholds.`,
              },
            ],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        }

        const rows = result.rows.map((r) => result.columns.map((c) => r.values[c] ?? ""));
        const notes: string[] = [];
        if (result.totalFound !== null) notes.push(`Total matches on Screener: ${result.totalFound}.`);
        if (result.truncated)
          notes.push(
            `Showing first ${result.rows.length} rows. Guest access is rate-limited by Screener; a logged-in session (SCREENER_SESSION_COOKIE) unlocks more.`
          );

        const text = truncateText(
          `${notes.join(" ")}\n\n${markdownTable(result.columns, rows)}`.trim()
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof ScreenerRequestError ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
