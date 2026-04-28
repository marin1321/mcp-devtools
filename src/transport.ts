import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { McpDevtoolsConfig } from "./types/config.js";
import { ConfigError } from "./types/errors.js";

/**
 * Creates the MCP transport based on the loaded config.
 *
 * `stdio` is the only transport supported in v1. HTTP ships in Phase 3 — see
 * the master plan §7.5 (RF-08).
 *
 * stdout is reserved for protocol framing on stdio; never write logs there.
 * The pino logger is already pinned to stderr in `utils/logger.ts`.
 */
export function createTransport(config: McpDevtoolsConfig): Transport {
  switch (config.transport) {
    case "stdio":
      return new StdioServerTransport();
    case "http":
      throw new ConfigError("HTTP transport is not implemented yet (planned for Phase 3)", {
        transport: config.transport,
      });
    default: {
      const exhaustive: never = config.transport;
      throw new ConfigError(`Unknown transport: ${String(exhaustive)}`);
    }
  }
}
