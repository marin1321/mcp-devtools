import { afterEach, describe, expect, it } from "vitest";

import { McpDevtoolsServer } from "../src/server.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";

const TEST_PORT = 49_152 + Math.floor(Math.random() * 16_000);

describe("HTTP transport", () => {
  let server: McpDevtoolsServer;

  afterEach(async () => {
    await server?.stop();
  });

  it("starts an HTTP server on the configured port", async () => {
    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port: TEST_PORT,
    });
    server = new McpDevtoolsServer(config);
    await server.start();

    const addr = server.getHttpAddress();
    expect(addr).not.toBeNull();
    expect(addr!.port).toBe(TEST_PORT);
  });

  it("responds to a valid MCP initialize request", async () => {
    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port: TEST_PORT + 1,
    });
    server = new McpDevtoolsServer(config);
    await server.start();

    const response = await fetch(`http://127.0.0.1:${TEST_PORT + 1}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      }),
    });

    expect(response.ok).toBe(true);
    const text = await response.text();
    expect(text).toContain("mcp-devtools");
  });

  it("stop() gracefully shuts down the HTTP server", async () => {
    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port: TEST_PORT + 2,
    });
    server = new McpDevtoolsServer(config);
    await server.start();
    expect(server.getHttpAddress()).not.toBeNull();

    await server.stop();
    expect(server.getHttpAddress()).toBeNull();
  });

  it("getHttpAddress returns null for stdio transport", () => {
    const config = McpDevtoolsConfigSchema.parse({ transport: "stdio" });
    server = new McpDevtoolsServer(config);
    expect(server.getHttpAddress()).toBeNull();
  });
});
