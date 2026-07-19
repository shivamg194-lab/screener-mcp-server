import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetPeerComparisonInputSchema } from "../schemas/index.js";
import { getPeerComparison } from "../services/scraper.js";
import { ScreenerRequestError } from "../services/http.js";
import { markdownTable, truncateText } from "../services/format.js";

export function registerPeerComparisonTool(server: McpServer): void {
  server.registerTool(
    "screener_get_peer_comparison",
    {
      title: "Get Peer Comparison from Screener.in",
      description: `Fetch the peer-comparison table Screener.in shows on a company's page — the same industry peers, compared on CMP, P/E, market cap, ROE, and other columns Screener selects.

Args:
  - identifier (string): Ticker, company name, or screener.in URL/path.
  - consolidated (boolean, default true): Consolidated vs standalone.

Returns:
  JSON: { "columns": string[], "peers": [{ "name": string, "values": { [column]: string } }] }

Examples:
  - Use when: "How does TCS compare to its industry peers on P/E and ROE?" -> identifier="TCS"
  - Don't use when: You want a custom peer set with your own filter criteria (use screener_run_custom_screen instead)

Error Handling:
  - Returns an error if no peer table is found for the company (uncommon, but can happen for delisted or very niche companies).`,
      inputSchema: GetPeerComparisonInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ identifier, consolidated }) => {
      try {
        const peerData = await getPeerComparison(identifier, consolidated);

        const rows = peerData.peers.map((p) => peerData.columns.map((c) => p.values[c] ?? ""));
        const text = truncateText(markdownTable(peerData.columns, rows));

        return {
          content: [{ type: "text", text }],
          structuredContent: peerData as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof ScreenerRequestError ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
