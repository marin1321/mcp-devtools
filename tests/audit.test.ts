import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AuditLogger, _sanitizeInputForTesting as sanitizeInput } from "../src/audit.js";
import type { AuditEntry } from "../src/audit.js";
import { defineTool, registerTool } from "../src/tool-registry.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";
import { ScopeViolationError } from "../src/types/errors.js";
import { err, ok } from "../src/types/tool-result.js";

let tmpDir: string;
let auditPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "mcp-audit-"));
  auditPath = path.join(tmpDir, "audit.ndjson");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const config = McpDevtoolsConfigSchema.parse({});

function readAuditLines(): AuditEntry[] {
  const content = readFileSync(auditPath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as AuditEntry);
}

describe("AuditLogger", () => {
  it("writes NDJSON entries for successful tool calls", async () => {
    const logger = new AuditLogger(auditPath);
    logger.log({
      timestamp: new Date().toISOString(),
      tool: "echo_test",
      inputSummary: { message: "hello" },
      durationMs: 5,
      ok: true,
    });
    await logger.close();

    const entries = readAuditLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool).toBe("echo_test");
    expect(entries[0]!.ok).toBe(true);
    expect(entries[0]!.inputSummary).toEqual({ message: "hello" });
    expect(entries[0]!.errorCode).toBeUndefined();
  });

  it("writes error entries when a tool fails", async () => {
    const logger = new AuditLogger(auditPath);
    logger.log({
      timestamp: new Date().toISOString(),
      tool: "read_file",
      inputSummary: { path: "/etc/passwd" },
      durationMs: 2,
      ok: false,
      errorCode: "SCOPE_VIOLATION",
    });
    await logger.close();

    const entries = readAuditLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(false);
    expect(entries[0]!.errorCode).toBe("SCOPE_VIOLATION");
  });

  it("masks secrets in inputSummary", async () => {
    const logger = new AuditLogger(auditPath);
    logger.log({
      timestamp: new Date().toISOString(),
      tool: "run_command",
      inputSummary: {
        password: "super-secret",
        api_key: "sk-123",
        token: "tok-abc",
        secret: "hidden",
        credential: "cred-xyz",
        private: "priv-data",
        normalField: "visible",
      },
      durationMs: 10,
      ok: true,
    });
    await logger.close();

    const entries = readAuditLines();
    const summary = entries[0]!.inputSummary as Record<string, unknown>;
    expect(summary["password"]).toBe("[REDACTED]");
    expect(summary["api_key"]).toBe("[REDACTED]");
    expect(summary["token"]).toBe("[REDACTED]");
    expect(summary["secret"]).toBe("[REDACTED]");
    expect(summary["credential"]).toBe("[REDACTED]");
    expect(summary["private"]).toBe("[REDACTED]");
    expect(summary["normalField"]).toBe("visible");
  });

  it("truncates long string values in inputSummary", async () => {
    const longString = "a".repeat(500);
    const logger = new AuditLogger(auditPath);
    logger.log({
      timestamp: new Date().toISOString(),
      tool: "write_file",
      inputSummary: { content: longString },
      durationMs: 15,
      ok: true,
    });
    await logger.close();

    const entries = readAuditLines();
    const summary = entries[0]!.inputSummary as Record<string, unknown>;
    const truncated = summary["content"] as string;
    expect(truncated.length).toBeLessThan(longString.length);
    expect(truncated).toContain("[truncated]");
    expect(truncated.startsWith("a".repeat(200))).toBe(true);
  });

  it("is not created when audit.enabled = false", () => {
    const cfg = McpDevtoolsConfigSchema.parse({ audit: { enabled: false } });
    expect(cfg.audit.enabled).toBe(false);
    expect(existsSync(auditPath)).toBe(false);
  });

  it("close() completes without error even with no writes", async () => {
    const logger = new AuditLogger(auditPath);
    await expect(logger.close()).resolves.toBeUndefined();
  });

  it("writes multiple entries as separate lines", async () => {
    const auditLogger = new AuditLogger(auditPath);
    for (let i = 0; i < 3; i++) {
      await auditLogger.writeSync({
        timestamp: new Date().toISOString(),
        tool: `tool_${i}`,
        inputSummary: {},
        durationMs: i,
        ok: true,
      });
    }
    await auditLogger.close();

    const entries = readAuditLines();
    expect(entries).toHaveLength(3);
    const tools = entries.map((e) => e.tool);
    expect(tools).toContain("tool_0");
    expect(tools).toContain("tool_1");
    expect(tools).toContain("tool_2");
  });

  it("resolves the path relative to scope directory", () => {
    const logger = new AuditLogger("./logs/audit.ndjson", "/my/scope");
    expect((logger as unknown as { filePath: string }).filePath).toBe(
      path.resolve("/my/scope", "./logs/audit.ndjson"),
    );
  });
});

describe("sanitizeInput", () => {
  it("masks nested secret keys", () => {
    const result = sanitizeInput({
      outer: { apiKey: "secret-value", name: "visible" },
    }) as Record<string, Record<string, unknown>>;
    expect(result["outer"]!["apiKey"]).toBe("[REDACTED]");
    expect(result["outer"]!["name"]).toBe("visible");
  });

  it("handles null and primitive inputs", () => {
    expect(sanitizeInput(null)).toBeNull();
    expect(sanitizeInput(42)).toBe(42);
    expect(sanitizeInput(true)).toBe(true);
  });

  it("truncates bare long strings", () => {
    const result = sanitizeInput("x".repeat(300)) as string;
    expect(result.length).toBeLessThan(300);
    expect(result).toContain("[truncated]");
  });
});

describe("AuditLogger integration with registerTool", () => {
  interface FakeMcpServer {
    registerTool: ReturnType<typeof vi.fn>;
  }

  function makeFakeServer(): FakeMcpServer {
    return { registerTool: vi.fn() };
  }

  it("logs a successful tool invocation via the audit logger", async () => {
    const auditLogger = new AuditLogger(auditPath);
    const fake = makeFakeServer();
    const def = defineTool({
      name: "demo",
      description: "demo tool",
      inputSchema: z.object({ n: z.number() }),
      handler: (input) => Promise.resolve(ok({ doubled: input.n * 2 })),
    });

    registerTool(fake as unknown as Parameters<typeof registerTool>[0], def, config, auditLogger);

    const wrapped = fake.registerTool.mock.calls[0]?.[2] as (input: unknown) => Promise<unknown>;
    await wrapped({ n: 5 });
    await auditLogger.close();

    const entries = readAuditLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool).toBe("demo");
    expect(entries[0]!.ok).toBe(true);
    expect(entries[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs a failed tool invocation via the audit logger", async () => {
    const auditLogger = new AuditLogger(auditPath);
    const fake = makeFakeServer();
    const def = defineTool({
      name: "failing",
      description: "fails",
      inputSchema: z.object({}),
      handler: () => {
        throw new ScopeViolationError("nope");
      },
    });

    registerTool(fake as unknown as Parameters<typeof registerTool>[0], def, config, auditLogger);

    const wrapped = fake.registerTool.mock.calls[0]?.[2] as (input: unknown) => Promise<unknown>;
    await wrapped({});
    await auditLogger.close();

    const entries = readAuditLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool).toBe("failing");
    expect(entries[0]!.ok).toBe(false);
    expect(entries[0]!.errorCode).toBe("SCOPE_VIOLATION");
  });

  it("logs error for handler returning err result", async () => {
    const auditLogger = new AuditLogger(auditPath);
    const fake = makeFakeServer();
    const def = defineTool({
      name: "soft_fail",
      description: "returns err",
      inputSchema: z.object({}),
      handler: () => Promise.resolve(err("CUSTOM_CODE", "something broke")),
    });

    registerTool(fake as unknown as Parameters<typeof registerTool>[0], def, config, auditLogger);

    const wrapped = fake.registerTool.mock.calls[0]?.[2] as (input: unknown) => Promise<unknown>;
    await wrapped({});
    await auditLogger.close();

    const entries = readAuditLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(false);
    expect(entries[0]!.errorCode).toBe("CUSTOM_CODE");
  });
});
