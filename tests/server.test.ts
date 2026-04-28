import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { McpDevtoolsServer } from "../src/server.js";
import { allTools } from "../src/tools/index.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";

describe("McpDevtoolsServer (integration via in-memory transport)", () => {
  let server: McpDevtoolsServer;
  let client: Client;

  beforeEach(async () => {
    const config = McpDevtoolsConfigSchema.parse({});
    server = new McpDevtoolsServer(config);
    client = new Client({ name: "test-client", version: "0.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.getServer().connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.getServer().close();
  });

  it("advertises every tool from the registry", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    const expected = allTools.map((tool) => tool.name).sort();
    expect(names).toEqual(expected);
  });

  it("includes echo_test in the published tool list", async () => {
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === "echo_test")).toBeDefined();
  });

  it("calls echo_test end-to-end and returns the message + timestamp", async () => {
    const result = await client.callTool({
      name: "echo_test",
      arguments: { message: "hola" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ message: "hola" });
    expect(typeof (result.structuredContent as { receivedAt?: unknown }).receivedAt).toBe("string");
  });

  it("returns an error for call_api when spec file does not exist", async () => {
    const result = await client.callTool({
      name: "call_api",
      arguments: { specPath: "n/a", operationId: "op" },
    });
    expect(result.isError).toBe(true);
  });

  it("returns an isError result when the input fails schema validation", async () => {
    const result = await client.callTool({
      name: "echo_test",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]?.text ?? "";
    expect(text).toMatch(/validation error/i);
  });

  it("exposes the loaded config and connection pool", () => {
    expect(server.getConfig().transport).toBe("stdio");
    expect(server.getConnectionPool()).toBeDefined();
  });
});

describe("McpDevtoolsServer lifecycle (without I/O transport)", () => {
  it("stop() is a no-op when start() was never called", async () => {
    const server = new McpDevtoolsServer(McpDevtoolsConfigSchema.parse({}));
    await expect(server.stop()).resolves.toBeUndefined();
  });
});
