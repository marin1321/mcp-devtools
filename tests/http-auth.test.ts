import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveToken, validateBearerToken } from "../src/auth.js";
import { McpDevtoolsServer } from "../src/server.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";

const BASE_PORT = 49_152 + Math.floor(Math.random() * 14_000);

const MCP_INIT_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "auth-test", version: "0.0.0" },
  },
});

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("resolveToken", () => {
  it("returns undefined for undefined input", () => {
    expect(resolveToken(undefined)).toBeUndefined();
  });

  it("returns a literal token as-is", () => {
    expect(resolveToken("my-secret")).toBe("my-secret");
  });

  it("resolves env:VAR_NAME from process.env", () => {
    vi.stubEnv("TEST_MCP_TOKEN", "from-env");
    expect(resolveToken("env:TEST_MCP_TOKEN")).toBe("from-env");
    vi.unstubAllEnvs();
  });

  it("returns undefined when env var is not set", () => {
    delete process.env.NONEXISTENT_VAR;
    expect(resolveToken("env:NONEXISTENT_VAR")).toBeUndefined();
  });
});

describe("validateBearerToken", () => {
  const token = "test-token-123";

  it("returns true for a valid Bearer header", () => {
    expect(validateBearerToken("Bearer test-token-123", token)).toBe(true);
  });

  it("returns false for undefined header", () => {
    expect(validateBearerToken(undefined, token)).toBe(false);
  });

  it("returns false for wrong token", () => {
    expect(validateBearerToken("Bearer wrong-token", token)).toBe(false);
  });

  it("returns false for missing Bearer prefix", () => {
    expect(validateBearerToken("test-token-123", token)).toBe(false);
  });

  it("returns false for different-length token", () => {
    expect(validateBearerToken("Bearer short", token)).toBe(false);
  });

  it("is case-insensitive on the Bearer prefix", () => {
    expect(validateBearerToken("bearer test-token-123", token)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("HTTP auth integration", () => {
  let server: McpDevtoolsServer;
  let port: number;

  afterEach(async () => {
    await server?.stop();
  });

  it("rejects requests without token when auth is configured", async () => {
    port = BASE_PORT;
    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port,
      auth: { token: "secret-abc" },
    });
    server = new McpDevtoolsServer(config);
    await server.start();

    const res = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: MCP_INIT_BODY,
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects requests with wrong token", async () => {
    port = BASE_PORT + 1;
    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port,
      auth: { token: "secret-abc" },
    });
    server = new McpDevtoolsServer(config);
    await server.start();

    const res = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Authorization: "Bearer wrong-token" },
      body: MCP_INIT_BODY,
    });

    expect(res.status).toBe(401);
  });

  it("accepts requests with correct token", async () => {
    port = BASE_PORT + 2;
    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port,
      auth: { token: "secret-abc" },
    });
    server = new McpDevtoolsServer(config);
    await server.start();

    const res = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Authorization: "Bearer secret-abc" },
      body: MCP_INIT_BODY,
    });

    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toContain("mcp-devtools");
  });

  it("allows all requests when no auth is configured (backward compatible)", async () => {
    port = BASE_PORT + 3;
    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port,
    });
    server = new McpDevtoolsServer(config);
    await server.start();

    const res = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: MCP_INIT_BODY,
    });

    expect(res.ok).toBe(true);
  });

  it("resolves token from env:VAR at startup", async () => {
    port = BASE_PORT + 4;
    vi.stubEnv("MCP_TEST_AUTH_TOKEN", "env-secret");

    const config = McpDevtoolsConfigSchema.parse({
      transport: "http",
      port,
      auth: { token: "env:MCP_TEST_AUTH_TOKEN" },
    });
    server = new McpDevtoolsServer(config);
    await server.start();

    const noAuth = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: MCP_INIT_BODY,
    });
    expect(noAuth.status).toBe(401);

    const withAuth = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Authorization: "Bearer env-secret" },
      body: MCP_INIT_BODY,
    });
    expect(withAuth.ok).toBe(true);

    vi.unstubAllEnvs();
  });
});
