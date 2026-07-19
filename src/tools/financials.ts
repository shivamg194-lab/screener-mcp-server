import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetFinancialStatementInputSchema } from "../schemas/index.js";
import { getFinancialStatement } from "../services/scraper.js";
import { ScreenerRequestError } from "../services/http.js";
import { markdownTable, truncateText } from "../services/format.js";

export function registerFinancialStatementTool(server: McpServer): void {
  server.registerTool(
    "screener_get_financial_statement",
    {
      title: "Get Financial Statement from Screener.in",
      description: `Fetch a multi-period financial statement table for a company from Screener.in: quarterly results, annual profit & loss, balance sheet, cash flow, or per-year efficiency ratios.

Args:
  - identifier (string): Ticker, company name, or screener.in URL/path.
  - statement (enum): One of "quarters", "profit-loss", "balance-sheet", "cash-flow", "ratios".
  - consolidated (boolean, default true): Consolidated vs standalone.

Returns:
  JSON: { "section": string, "periods": string[], "rows": [{ "label": string, "values": string[] }] }
  Each row's values align positionally with "periods".

Examples:
  - Use when: "Show me TCS's last few years of profit & loss" -> identifier="TCS", statement="profit-loss"
  - Use when: "What's Infosys's debtor days trend?" -> identifier="INFY", statement="ratios"
  - Don't use when: You just want current P/E or market cap (use screener_get_company_overview)

Error Handling:
  - Returns an error if the statement section isn't present for that company (e.g. some companies don't report all statements) or if the company can't be found.`,
      inputSchema: GetFinancialStatementInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ identifier, statement, consolidated }) => {
      try {
        const table = await getFinancialStatement(identifier, statement, consolidated);

        const headers = ["Line item", ...table.periods];
        const rows = table.rows.map((r) => [r.label, ...r.values]);
        const text = truncateText(`## ${table.section}\n\n${markdownTable(headers, rows)}`);

        return {
          content: [{ type: "text", text }],
          structuredContent: table as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof ScreenerRequestError ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
