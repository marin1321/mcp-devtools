import type { McpDevtoolsConfig } from "./types/config.js";
import { logger } from "./utils/logger.js";

/**
 * MCP server lifecycle wrapper.
 *
 * Phase 0 stub — full implementation lands in Phase 1 once Filesystem and
 * Database tools are ready to register. This file establishes the public
 * surface so `index.ts` can be wired end-to-end.
 */
export class McpDevtoolsServer {
  private readonly config: McpDevtoolsConfig;
  private started = false;

  constructor(config: McpDevtoolsConfig) {
    this.config = config;
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }
    logger.info(
      {
        scope: this.config.scope,
        transport: this.config.transport,
        toolCount: 0,
      },
      "mcp-devtools server starting (Phase 0 stub)",
    );
    this.started = true;
    return Promise.resolve();
  }

  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    logger.info("mcp-devtools server stopping");
    this.started = false;
    return Promise.resolve();
  }

  public getConfig(): McpDevtoolsConfig {
    return this.config;
  }
}
