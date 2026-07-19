import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchCompaniesInputSchema } from "../schemas/index.js";
import { searchCompanies } from "../services/scraper.js";
import { ScreenerRequestError } from "../services/http.js";
import { BASE_URL } from "../constants.js";

export function registerSearchTool(server: McpServer): void {
  server.registerTool(
    "screener_search_companies",
    {
      title: "Search Companies on Screener.in",
      description: `Search Screener.in for listed Indian companies by name or ticker symbol.

Use this first when you're not sure of a company's exact ticker or how Screener.in identifies it — the result's "id" or "url" can be passed as the identifier to the other screener_* tools.

Args:
  - query (string): Company name or ticker, e.g. "TCS", "Infosys", "HDFC Bank"

Returns:
  JSON with a "results" array, each item having:
  { "id": string, "name": string, "url": string (relative screener.in path) }

Examples:
  - Use when: "Find the ticker for Tata Consultancy Services" -> query="Tata Consultancy"
  - Don't use when: You already have the exact ticker (just call screener_get_company_overview directly)

Error Handling:
  - Returns an empty "results" array if nothing matches`,
      inputSchema: SearchCompaniesInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query }) => {
      try {
        const results = await searchCompanies(query);
        const output = {
          results: results.map((r) => ({
            id: r.id,
            name: r.name,
            url: r.url.startsWith("http") ? r.url : `${BASE_URL}${r.url}`,
          })),
        };
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No companies found matching "${query}".` }],
            structuredContent: output,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        const message = err instanceof ScreenerRequestError ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
