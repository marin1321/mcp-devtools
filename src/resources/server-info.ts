import { readFileSync } from "node:fs";

import type { McpServer, ReadResourceCallback } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ToolDefinition } from "../tool-registry.js";
import type { McpDevtoolsConfig } from "../types/config.js";

function readPackageVersion(): string {
  try {
    const url = new URL("../../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(url, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

interface ServerInfoPayload {
  version: string;
  transport: string;
  scope: string;
  toolCount: number;
  databaseConnections: string[];
  nodeVersion: string;
}

function buildServerInfo(
  config: McpDevtoolsConfig,
  tools: readonly ToolDefinition[],
): ServerInfoPayload {
  return {
    version: readPackageVersion(),
    transport: config.transport,
    scope: config.scope,
    toolCount: tools.length,
    databaseConnections: Object.keys(config.databases),
    nodeVersion: process.version,
  };
}

export function registerServerInfoResource(
  server: McpServer,
  config: McpDevtoolsConfig,
  tools: readonly ToolDefinition[],
): void {
  const readCallback: ReadResourceCallback = () => {
    const info = buildServerInfo(config, tools);
    return {
      contents: [
        {
          uri: "devtools://server-info",
          text: JSON.stringify(info, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  };

  server.registerResource(
    "server_info",
    "devtools://server-info",
    {
      description: "Server runtime information: version, transport, scope, tool count, and more.",
      mimeType: "application/json",
    },
    readCallback,
  );
}
