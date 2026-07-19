import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetCompanyOverviewInputSchema } from "../schemas/index.js";
import { getCompanyOverview } from "../services/scraper.js";
import { ScreenerRequestError } from "../services/http.js";
import { truncateText } from "../services/format.js";

export function registerOverviewTool(server: McpServer): void {
  server.registerTool(
    "screener_get_company_overview",
    {
      title: "Get Company Overview from Screener.in",
      description: `Fetch a company's snapshot from its Screener.in page: key ratios (Market Cap, Current Price, Stock P/E, Book Value, Dividend Yield, ROCE, ROE, Face Value, etc.), a short "About" description, and Screener's machine-generated Pros/Cons list.

This does NOT include multi-year financial statements — use screener_get_financial_statement for those, or screener_get_peer_comparison for peer benchmarking.

Args:
  - identifier (string): Ticker (e.g. "TCS"), company name (e.g. "Tata Consultancy Services"), or a screener.in company URL/path. If unsure of the exact match, call screener_search_companies first.
  - consolidated (boolean, default true): Consolidated (with subsidiaries) vs standalone financials.

Returns:
  JSON: { "name": string, "screenerUrl": string, "aboutText": string|null, "topRatios": [{name, value}], "pros": string[], "cons": string[] }

Examples:
  - Use when: "What's TCS's current P/E and ROE?" -> identifier="TCS"
  - Don't use when: You need 10 years of quarterly revenue (use screener_get_financial_statement instead)

Error Handling:
  - Returns an error if no matching company is found — try screener_search_companies to confirm the right name/ticker first.`,
      inputSchema: GetCompanyOverviewInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ identifier, consolidated }) => {
      try {
        const overview = await getCompanyOverview(identifier, consolidated);

        const ratioLines = overview.topRatios.map((r) => `- ${r.name}: ${r.value}`).join("\n");
        const prosLines = overview.pros.length
          ? overview.pros.map((p) => `- ${p}`).join("\n")
          : "_None listed_";
        const consLines = overview.cons.length
          ? overview.cons.map((c) => `- ${c}`).join("\n")
          : "_None listed_";

        const text = truncateText(
          `# ${overview.name}\n${overview.screenerUrl}\n\n` +
            `${overview.aboutText ? overview.aboutText + "\n\n" : ""}` +
            `## Key Ratios\n${ratioLines || "_None found_"}\n\n` +
            `## Pros\n${prosLines}\n\n## Cons\n${consLines}`
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: overview as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof ScreenerRequestError ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
