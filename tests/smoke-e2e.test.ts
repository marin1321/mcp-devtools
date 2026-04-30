/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
/**
 * End-to-end smoke tests — exercises every tool, resource, prompt,
 * and feature through the MCP server using InMemoryTransport.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { McpDevtoolsServer } from "../src/server.js";
import type { McpDevtoolsConfig } from "../src/types/config.js";

const SMOKE_DIR = join(tmpdir(), `mcp-smoke-${Date.now()}`);
const SQLITE_PATH = join(SMOKE_DIR, "smoke.sqlite");
const LOG_FILE = join(SMOKE_DIR, "app.log");
const ENV_FILE = join(SMOKE_DIR, ".env");
const AUDIT_FILE = join(SMOKE_DIR, "audit.ndjson");
const OPENAPI_SPEC = join(SMOKE_DIR, "petstore.json");

function makeConfig(overrides: Partial<McpDevtoolsConfig> = {}): McpDevtoolsConfig {
  return {
    scope: SMOKE_DIR,
    allowedCommands: ["echo", "ls", "node"],
    commandTimeoutMs: 10_000,
    commandOutputMaxBytes: 50 * 1024,
    databases: {
      default: {
        type: "sqlite",
        connectionString: SQLITE_PATH,
        readOnly: false,
        queryTimeoutMs: 5000,
        maxRows: 100,
      },
    },
    logs: { paths: [join(SMOKE_DIR, "*.log")], maxLines: 200 },
    transport: "stdio",
    port: 3333,
    debug: false,
    plugins: [],
    audit: { enabled: true, path: AUDIT_FILE },
    auth: {},
    ...overrides,
  };
}

let server: McpDevtoolsServer;
let client: Client;

beforeAll(async () => {
  mkdirSync(SMOKE_DIR, { recursive: true });

  // Seed test files
  writeFileSync(join(SMOKE_DIR, "hello.txt"), "Hello from mcp-devtools!\nLine 2\nLine 3\n");
  mkdirSync(join(SMOKE_DIR, "subdir"), { recursive: true });
  writeFileSync(join(SMOKE_DIR, "subdir", "nested.ts"), "export const x = 42;\n");

  // Seed log file
  const logLines = [
    '{"level":"info","msg":"server started","ts":"2026-01-01T00:00:00Z"}',
    '{"level":"error","msg":"something broke","ts":"2026-01-01T00:01:00Z"}',
    "plain text log line",
    '{"level":"info","msg":"request handled","ts":"2026-01-01T00:02:00Z"}',
  ];
  writeFileSync(LOG_FILE, logLines.join("\n") + "\n");

  // Seed .env
  writeFileSync(ENV_FILE, "APP_NAME=smoke-test\nSECRET_KEY=supersecret123\nDEBUG=true\n");

  // Seed OpenAPI spec
  const petstoreSpec = {
    openapi: "3.0.3",
    info: { title: "Petstore Smoke", version: "1.0.0" },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          summary: "List all pets",
          responses: { "200": { description: "A list of pets" } },
        },
      },
    },
  };
  writeFileSync(OPENAPI_SPEC, JSON.stringify(petstoreSpec, null, 2));

  // Start server with InMemoryTransport
  const config = makeConfig();
  server = new McpDevtoolsServer(config);
  client = new Client({ name: "smoke-test-client", version: "1.0.0" });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.getServer().connect(serverTransport);
  await client.connect(clientTransport);

  // Create SQLite table
  const pool = server.getConnectionPool();
  const db = await pool.get("default");
  await db.query(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)",
  );
  await db.query("INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')");
  await db.query("INSERT INTO users (name, email) VALUES ('Bob', 'bob@test.com')");
});

afterAll(async () => {
  await server.stop();
  rmSync(SMOKE_DIR, { recursive: true, force: true });
});

// ─── FILESYSTEM TOOLS ────────────────────────────────────────

describe("Filesystem Tools", () => {
  it("read_file — reads file content", async () => {
    const result = await client.callTool({ name: "read_file", arguments: { path: "hello.txt" } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Hello from mcp-devtools!");
    expect(text).toContain("Line 2");
  });

  it("read_file — reads with line range", async () => {
    const result = await client.callTool({
      name: "read_file",
      arguments: { path: "hello.txt", startLine: 2, endLine: 2 },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Line 2");
    expect(text).not.toContain("Hello");
  });

  it("write_file — creates new file", async () => {
    await client.callTool({
      name: "write_file",
      arguments: { path: "created.txt", content: "Written by smoke test" },
    });
    const onDisk = readFileSync(join(SMOKE_DIR, "created.txt"), "utf-8");
    expect(onDisk).toBe("Written by smoke test");
  });

  it("list_directory — lists root entries", async () => {
    const result = await client.callTool({
      name: "list_directory",
      arguments: { path: "." },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("hello.txt");
    expect(text).toContain("subdir");
  });

  it("list_directory — deep with glob", async () => {
    const result = await client.callTool({
      name: "list_directory",
      arguments: { path: ".", depth: 5, glob: "**/*.ts" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("nested.ts");
  });

  it("search_files — finds text pattern", async () => {
    const result = await client.callTool({
      name: "search_files",
      arguments: { pattern: "42", path: "." },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("42");
    expect(text).toContain("nested.ts");
  });

  it("get_file_info — returns metadata", async () => {
    const result = await client.callTool({
      name: "get_file_info",
      arguments: { path: "hello.txt" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const info = JSON.parse(text);
    expect(info.type).toBe("file");
    expect(info.lines).toBe(3);
    expect(info.size).toBeGreaterThan(0);
  });

  it("read_file — scope violation rejected", async () => {
    const result = await client.callTool({
      name: "read_file",
      arguments: { path: "../../../etc/passwd" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toMatch(/scope|outside/i);
  });
});

// ─── DATABASE TOOLS ──────────────────────────────────────────

describe("Database Tools", () => {
  it("query_db — SELECT returns rows", async () => {
    const result = await client.callTool({
      name: "query_db",
      arguments: { sql: "SELECT * FROM users ORDER BY id", connection: "default" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0].name).toBe("Alice");
    expect(data.rows[1].name).toBe("Bob");
  });

  it("list_tables — finds users table", async () => {
    const result = await client.callTool({
      name: "list_tables",
      arguments: { connection: "default" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const data = JSON.parse(text);
    const tableNames = data.tables.map((t: { name: string }) => t.name);
    expect(tableNames).toContain("users");
  });

  it("describe_table — returns column metadata", async () => {
    const result = await client.callTool({
      name: "describe_table",
      arguments: { table: "users", connection: "default" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const data = JSON.parse(text);
    const colNames = data.columns.map((c: { name: string }) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("email");
  });
});

// ─── PROCESS TOOLS ───────────────────────────────────────────

describe("Process Tools", () => {
  it("run_command — echo works", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "echo", args: ["hello", "smoke"] },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("hello smoke");
  });

  it("run_command — blocked command rejected", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "rm", args: ["-rf", "/"] },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toMatch(/allowed|permit|allowlist/i);
  });

  it("run_command — shell injection rejected", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "echo", args: ["hello; rm -rf /"] },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toMatch(/shell|meta/i);
  });

  it("read_logs — reads log file", async () => {
    const result = await client.callTool({
      name: "read_logs",
      arguments: { path: "app.log" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("server started");
    expect(text).toContain("something broke");
  });

  it("read_logs — filter by keyword", async () => {
    const result = await client.callTool({
      name: "read_logs",
      arguments: { path: "app.log", filter: "error" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("something broke");
    expect(text).not.toContain("server started");
  });

  it("get_env — returns env from .env file", async () => {
    const result = await client.callTool({
      name: "get_env",
      arguments: { envFilePath: ".env" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.variables.APP_NAME).toBe("smoke-test");
    expect(data.variables.DEBUG).toBe("true");
  });

  it("get_env — masks secrets", async () => {
    const result = await client.callTool({
      name: "get_env",
      arguments: { envFilePath: ".env" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.variables.SECRET_KEY).toMatch(/\*+/);
    expect(data.variables.SECRET_KEY).not.toBe("supersecret123");
  });
});

// ─── OPENAPI TOOLS ───────────────────────────────────────────

describe("OpenAPI Tools", () => {
  it("parse_openapi — parses spec", async () => {
    const result = await client.callTool({
      name: "parse_openapi",
      arguments: { path: "petstore.json" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.title).toBe("Petstore Smoke");
    expect(data.operations).toHaveLength(1);
    expect(data.operations[0].operationId).toBe("listPets");
  });

  it("call_api — calls mock API endpoint", async () => {
    const mockServer = createServer((req, res) => {
      if (req.url === "/pets") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ id: 1, name: "Rex" }]));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((r) => mockServer.listen(0, r));
    const port = (mockServer.address() as { port: number }).port;

    try {
      const specWithServer = {
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0.0" },
        servers: [{ url: `http://localhost:${port}` }],
        paths: {
          "/pets": {
            get: {
              operationId: "listPets",
              summary: "List pets",
              responses: { "200": { description: "ok" } },
            },
          },
        },
      };
      const specFile = join(SMOKE_DIR, "petstore-server.json");
      writeFileSync(specFile, JSON.stringify(specWithServer));

      const result = await client.callTool({
        name: "call_api",
        arguments: { specPath: "petstore-server.json", operationId: "listPets" },
      });

      const text = (result.content as Array<{ text: string }>)[0].text;
      const data = JSON.parse(text);
      expect(data.status).toBe(200);
    } finally {
      await new Promise<void>((r, j) => mockServer.close((e) => (e ? j(e) : r())));
    }
  });
});

// ─── MCP RESOURCES ───────────────────────────────────────────

describe("MCP Resources", () => {
  it("lists available resources", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("devtools://server-info");
    expect(uris).toContain("devtools://tools");
  });

  it("reads server-info resource", async () => {
    const { contents } = await client.readResource({ uri: "devtools://server-info" });
    const data = JSON.parse((contents[0] as { text: string }).text);
    expect(data.scope).toBe(SMOKE_DIR);
    expect(data.toolCount).toBeGreaterThanOrEqual(14);
  });

  it("reads tool-catalog resource", async () => {
    const { contents } = await client.readResource({ uri: "devtools://tools" });
    const data = JSON.parse((contents[0] as { text: string }).text);
    expect(data.length).toBeGreaterThanOrEqual(14);
    const names = data.map((t: { name: string }) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("query_db");
    expect(names).toContain("run_command");
    expect(names).toContain("parse_openapi");
  });
});

// ─── MCP PROMPTS ─────────────────────────────────────────────

describe("MCP Prompts", () => {
  it("lists available prompts", async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).toContain("debug_error");
    expect(names).toContain("code_review");
    expect(names).toContain("explore_codebase");
    expect(names).toContain("refactor_function");
  });

  it("gets debug_error prompt", async () => {
    const result = await client.getPrompt({
      name: "debug_error",
      arguments: { error_message: "TypeError: undefined is not a function" },
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    const text = (result.messages[0].content as { text: string }).text;
    expect(text).toContain("TypeError");
  });

  it("gets code_review prompt", async () => {
    const result = await client.getPrompt({
      name: "code_review",
      arguments: { file_path: "src/index.ts" },
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    const text = (result.messages[0].content as { text: string }).text;
    expect(text).toContain("src/index.ts");
  });

  it("gets explore_codebase prompt", async () => {
    const result = await client.getPrompt({
      name: "explore_codebase",
      arguments: {},
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
  });

  it("gets refactor_function prompt", async () => {
    const result = await client.getPrompt({
      name: "refactor_function",
      arguments: { function_name: "handleRequest", file_path: "server.ts" },
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    const text = (result.messages[0].content as { text: string }).text;
    expect(text).toContain("handleRequest");
  });
});

// ─── AUDIT LOG ───────────────────────────────────────────────

describe("Audit Log", () => {
  it("records tool invocations to NDJSON file", async () => {
    // The tools called above should have generated audit entries
    // Give async writes time to flush
    await new Promise((r) => setTimeout(r, 500));
    expect(existsSync(AUDIT_FILE)).toBe(true);
    const raw = readFileSync(AUDIT_FILE, "utf-8").trim();
    const entries = raw.split("\n").map((l) => JSON.parse(l));
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const entry = entries[0];
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("tool");
    expect(entry).toHaveProperty("durationMs");
    expect(entry).toHaveProperty("ok");
  });

  it("redacts sensitive fields in audit entries", async () => {
    const raw = readFileSync(AUDIT_FILE, "utf-8").trim();
    expect(raw).not.toContain("supersecret123");
  });
});

// ─── SECURITY TESTS ──────────────────────────────────────────

describe("Security", () => {
  it("filesystem — path traversal blocked", async () => {
    const result = await client.callTool({
      name: "read_file",
      arguments: { path: "../../etc/passwd" },
    });
    expect(result.isError).toBe(true);
  });

  it("filesystem — absolute path outside scope blocked", async () => {
    const result = await client.callTool({
      name: "read_file",
      arguments: { path: "/etc/hostname" },
    });
    expect(result.isError).toBe(true);
  });

  it("run_command — unlisted command blocked", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "curl", args: ["http://evil.com"] },
    });
    expect(result.isError).toBe(true);
  });

  it("write_file — outside scope blocked", async () => {
    const result = await client.callTool({
      name: "write_file",
      arguments: { path: "/tmp/evil.txt", content: "hacked" },
    });
    expect(result.isError).toBe(true);
  });

  it("database — DROP TABLE blocked in readOnly mode", async () => {
    const roConfig = makeConfig({
      databases: {
        readonly_db: {
          type: "sqlite",
          connectionString: SQLITE_PATH,
          readOnly: true,
          queryTimeoutMs: 5000,
          maxRows: 100,
        },
      },
    });

    const roServer = new McpDevtoolsServer(roConfig);
    const roClient = new Client({ name: "ro-test", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await roServer.getServer().connect(st);
    await roClient.connect(ct);

    const result = await roClient.callTool({
      name: "query_db",
      arguments: { sql: "DROP TABLE users", connection: "readonly_db" },
    });
    expect(result.isError).toBe(true);

    await roServer.stop();
  });
});

// ─── HTTP TRANSPORT + AUTH ───────────────────────────────────

describe("HTTP Transport + Auth", () => {
  let httpServer: McpDevtoolsServer;
  let httpPort: number;
  const TEST_TOKEN = "smoke-test-secret-token-xyz";

  beforeAll(async () => {
    httpServer = new McpDevtoolsServer(
      makeConfig({
        transport: "http",
        port: 0, // will pick random
        auth: { token: TEST_TOKEN },
      }),
    );
    await httpServer.start();
    const addr = httpServer.getHttpAddress();
    httpPort = addr!.port;
  });

  afterAll(async () => {
    await httpServer.stop();
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await fetch(`http://localhost:${httpPort}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects wrong token with 401", async () => {
    const res = await fetch(`http://localhost:${httpPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts valid token", async () => {
    const res = await fetch(`http://localhost:${httpPort}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2025-03-26",
          clientInfo: { name: "smoke-http", version: "1.0.0" },
          capabilities: {},
        },
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── ECHO TEST ───────────────────────────────────────────────

describe("Echo Test (pipeline validation)", () => {
  it("echo_test — round-trips message", async () => {
    const result = await client.callTool({
      name: "echo_test",
      arguments: { message: "ping" },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("ping");
  });
});
