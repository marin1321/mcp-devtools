import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ToolDefinition } from "../tool-registry.js";
import type { McpDevtoolsConfig } from "../types/config.js";

import { registerServerInfoResource } from "./server-info.js";
import { registerToolCatalogResource } from "./tool-catalog.js";

export function registerAllResources(
  server: McpServer,
  config: McpDevtoolsConfig,
  tools: readonly ToolDefinition[],
): void {
  registerToolCatalogResource(server, tools);
  registerServerInfoResource(server, config, tools);
}
