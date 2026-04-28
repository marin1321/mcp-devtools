import { readFileSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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
  private httpServer: HttpServer | null = null;
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
    const { transport, kind } = createTransport(this.config);
    await this.server.connect(transport);

    if (kind === "http") {
      const httpTransport = transport as StreamableHTTPServerTransport;
      this.httpServer = createServer((req, res) => {
        void httpTransport.handleRequest(req, res);
      });
      await new Promise<void>((resolve) => {
        this.httpServer!.listen(this.config.port, () => resolve());
      });
      logger.info(
        { port: this.config.port },
        `mcp-devtools HTTP server listening on port ${this.config.port}`,
      );
    }

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

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = null;
    }

    await this.pool.closeAll();
    await this.server.close();
    this.started = false;
  }

  public getConfig(): McpDevtoolsConfig {
    return this.config;
  }

  /**
   * Returns the address the HTTP server is listening on, or `null` if the
   * server is not running in HTTP mode.
   */
  public getHttpAddress(): { port: number; host: string } | null {
    if (!this.httpServer) return null;
    const addr = this.httpServer.address();
    if (addr === null || typeof addr === "string") return null;
    return { port: addr.port, host: addr.address };
  }

  /**
   * Exposed for tests that need to inject a custom transport (e.g.
   * {@link import("@modelcontextprotocol/sdk/inMemory.js").InMemoryTransport}).
   */
  public getServer(): McpServer {
    return this.server;
  }
}
