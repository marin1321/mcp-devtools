import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAllTools } from "./tool-registry.js";
import { type ConnectionPool, createConnectionPool } from "./tools/database/connection-pool.js";
import { allTools } from "./tools/index.js";
import { createTransport } from "./transport.js";
import type { McpDevtoolsConfig } from "./types/config.js";
import { logger } from "./utils/logger.js";

function readPackageVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(url, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const SERVER_VERSION = readPackageVersion();

/**
 * Lifecycle wrapper around `@modelcontextprotocol/sdk`'s {@link McpServer}.
 *
 * Wires the configured transport, registers every tool from
 * `tools/index.ts`, and exposes start/stop hooks for `index.ts` and tests.
 */
export class McpDevtoolsServer {
  private readonly config: McpDevtoolsConfig;
  private readonly server: McpServer;
  private readonly pool: ConnectionPool;
  private started = false;

  constructor(config: McpDevtoolsConfig) {
    this.config = config;
    this.pool = createConnectionPool(config.databases);
    this.server = new McpServer(
      {
        name: "mcp-devtools",
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
          logging: {},
        },
      },
    );
    registerAllTools(this.server, allTools, this.config);
  }

  public getConnectionPool(): ConnectionPool {
    return this.pool;
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }
    const transport = createTransport(this.config);
    await this.server.connect(transport);
    this.started = true;
    logger.info(
      {
        scope: this.config.scope,
        transport: this.config.transport,
        toolCount: allTools.length,
      },
      "mcp-devtools server ready",
    );
  }

  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    logger.info("mcp-devtools server stopping");
    await this.pool.closeAll();
    await this.server.close();
    this.started = false;
  }

  public getConfig(): McpDevtoolsConfig {
    return this.config;
  }

  /**
   * Exposed for tests that need to inject a custom transport (e.g.
   * {@link import("@modelcontextprotocol/sdk/inMemory.js").InMemoryTransport}).
   */
  public getServer(): McpServer {
    return this.server;
  }
}
