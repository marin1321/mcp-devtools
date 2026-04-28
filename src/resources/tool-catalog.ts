import type { McpServer, ReadResourceCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ToolDefinition } from "../tool-registry.js";

interface ToolCatalogEntry {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function buildCatalog(tools: readonly ToolDefinition[]): ToolCatalogEntry[] {
  return tools.map((tool) => ({
    name: tool.name,
    ...(tool.title !== undefined ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema),
  }));
}

export function registerToolCatalogResource(
  server: McpServer,
  tools: readonly ToolDefinition[],
): void {
  const readCallback: ReadResourceCallback = () => {
    const catalog = buildCatalog(tools);
    return {
      contents: [
        {
          uri: "devtools://tools",
          text: JSON.stringify(catalog, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  };

  server.registerResource("tool_catalog", "devtools://tools", {
    description: "List of all registered tools with their metadata and input schemas.",
    mimeType: "application/json",
  }, readCallback);
}
