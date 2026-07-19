#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerSearchTool } from "./tools/search.js";
import { registerOverviewTool } from "./tools/overview.js";
import { registerFinancialStatementTool } from "./tools/financials.js";
import { registerPeerComparisonTool } from "./tools/peers.js";
import { registerCustomScreenTool } from "./tools/screen.js";
import { registerTechnicalIndicatorTool } from "./tools/technical.js";
import {
  registerNseQuoteTool,
  registerNseAnnouncementsTool,
  registerNseCorporateActionsTool,
} from "./tools/nse.js";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "screener-mcp-server",
    version: "1.0.0",
  });

  registerSearchTool(server);
  registerOverviewTool(server);
  registerFinancialStatementTool(server);
  registerPeerComparisonTool(server);
  registerCustomScreenTool(server);
  registerTechnicalIndicatorTool(server);
  registerNseQuoteTool(server);
  registerNseAnnouncementsTool(server);
  registerNseCorporateActionsTool(server);

  return server;
}

async function runStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("screener-mcp-server running on stdio");
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`screener-mcp-server running on http://localhost:${port}/mcp`);
  });
}

const transportMode = process.env.TRANSPORT || "stdio";
if (transportMode === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
