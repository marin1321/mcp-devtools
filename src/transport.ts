import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { McpDevtoolsConfig } from "./types/config.js";
import { ConfigError } from "./types/errors.js";

export type TransportKind = "stdio" | "http";

export interface TransportResult {
  transport: Transport;
  kind: TransportKind;
}

/**
 * Creates the MCP transport based on the loaded config.
 *
 * - `stdio`: communicates over stdin/stdout (default). stdout is reserved for
 *   protocol framing; the pino logger is pinned to stderr.
 * - `http`: uses the MCP Streamable HTTP transport. The caller is responsible
 *   for wiring the returned {@link StreamableHTTPServerTransport} to an HTTP
 *   server (see {@link McpDevtoolsServer.start}).
 */
export function createTransport(config: McpDevtoolsConfig): TransportResult {
  switch (config.transport) {
    case "stdio":
      return { transport: new StdioServerTransport(), kind: "stdio" };
    case "http":
      return {
        transport: new StreamableHTTPServerTransport() as unknown as Transport,
        kind: "http",
      };
    default: {
      const exhaustive: never = config.transport;
      throw new ConfigError(`Unknown transport: ${String(exhaustive)}`);
    }
  }
}
