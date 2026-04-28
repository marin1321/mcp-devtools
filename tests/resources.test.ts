import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { McpDevtoolsServer } from "../src/server.js";
import { allTools } from "../src/tools/index.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";

describe("MCP Resources", () => {
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

  it("lists both resources", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(["devtools://server-info", "devtools://tools"]);
  });

  it("tool_catalog returns valid JSON with all tool names", async () => {
    const result = await client.readResource({ uri: "devtools://tools" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");

    const catalog = JSON.parse(result.contents[0].text as string) as Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
    const names = catalog.map((entry) => entry.name).sort();
    const expected = allTools.map((t) => t.name).sort();
    expect(names).toEqual(expected);

    for (const entry of catalog) {
      expect(entry.description).toBeTruthy();
      expect(entry.inputSchema).toBeDefined();
    }
  });

  it("server_info returns correct version and transport", async () => {
    const result = await client.readResource({ uri: "devtools://server-info" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");

    const info = JSON.parse(result.contents[0].text as string) as {
      version: string;
      transport: string;
      scope: string;
      toolCount: number;
      databaseConnections: string[];
      nodeVersion: string;
    };
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.transport).toBe("stdio");
    expect(info.toolCount).toBe(allTools.length);
    expect(info.nodeVersion).toMatch(/^v\d+/);
    expect(Array.isArray(info.databaseConnections)).toBe(true);
  });

  it("server_info includes database connection names when configured", async () => {
    await client.close();
    await server.getServer().close();

    const config = McpDevtoolsConfigSchema.parse({
      databases: {
        mydb: { type: "sqlite", connectionString: ":memory:" },
      },
    });
    server = new McpDevtoolsServer(config);
    client = new Client({ name: "test-client", version: "0.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.getServer().connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.readResource({ uri: "devtools://server-info" });
    const info = JSON.parse(result.contents[0].text as string) as {
      databaseConnections: string[];
    };
    expect(info.databaseConnections).toEqual(["mydb"]);
  });
});
