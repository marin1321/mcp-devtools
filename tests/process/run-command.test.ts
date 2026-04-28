import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCommandHandler } from "../../src/tools/process/run-command.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import {
  CommandError,
  CommandNotAllowedError,
  ScopeViolationError,
  ValidationError,
} from "../../src/types/errors.js";

let scope: string;

function configFor(scopeDir: string) {
  return McpDevtoolsConfigSchema.parse({
    scope: scopeDir,
    allowedCommands: ["node"],
  });
}

beforeEach(() => {
  scope = realpathSync(mkdtempSync(path.join(tmpdir(), "mcp-run-")));
});

afterEach(() => {
  rmSync(scope, { recursive: true, force: true });
});

describe("runCommandHandler", () => {
  it("runs `node --version` and captures stdout cleanly", async () => {
    const result = await runCommandHandler(
      { command: "node", args: ["--version"] },
      configFor(scope),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.exitCode).toBe(0);
    expect(result.data.stdout.trim()).toMatch(/^v\d+/);
    expect(result.data.stderr).toBe("");
    expect(result.data.timedOut).toBe(false);
    expect(result.data.truncated).toBe(false);
  });

  it("propagates a non-zero exit code", async () => {
    const result = await runCommandHandler(
      { command: "node", args: ["-e", "process.exit(2)"] },
      configFor(scope),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.exitCode).toBe(2);
  });

  it("captures stderr separately from stdout", async () => {
    const result = await runCommandHandler(
      { command: "node", args: ["-e", "console.error('boom')"] },
      configFor(scope),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stderr).toContain("boom");
    expect(result.data.stdout).toBe("");
  });

  it("rejects a command not in allowedCommands", async () => {
    await expect(
      runCommandHandler({ command: "rm", args: [] }, configFor(scope)),
    ).rejects.toBeInstanceOf(CommandNotAllowedError);
  });

  it("rejects a command name containing a path separator", async () => {
    await expect(
      runCommandHandler({ command: "/bin/node", args: [] }, configFor(scope)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns a CommandError when the binary is on the allowlist but missing from PATH", async () => {
    const cfg = McpDevtoolsConfigSchema.parse({
      scope,
      allowedCommands: ["definitely-not-a-real-binary-zxq"],
    });
    await expect(
      runCommandHandler({ command: "definitely-not-a-real-binary-zxq", args: [] }, cfg),
    ).rejects.toBeInstanceOf(CommandError);
  });

  it("rejects args containing shell metacharacters", async () => {
    await expect(
      runCommandHandler({ command: "node", args: ["-e", "1;rm -rf /"] }, configFor(scope)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      runCommandHandler({ command: "node", args: ["$(whoami)"] }, configFor(scope)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      runCommandHandler({ command: "node", args: ["a|b"] }, configFor(scope)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("times out long-running children with timedOut=true", async () => {
    const start = Date.now();
    const result = await runCommandHandler(
      {
        command: "node",
        args: ["-e", "setInterval(()=>{}, 100)"],
        timeoutMs: 200,
      },
      configFor(scope),
    );
    expect(Date.now() - start).toBeLessThan(3_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.timedOut).toBe(true);
    expect(result.data.exitCode === -1 || result.data.signal !== null).toBe(true);
  });

  it("truncates output that exceeds MAX_OUTPUT_BYTES and kills the child", async () => {
    const result = await runCommandHandler(
      {
        command: "node",
        args: ["-e", "process.stdout.write('a'.repeat(200000))"],
        timeoutMs: 5_000,
      },
      configFor(scope),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.truncated).toBe(true);
    expect(result.data.stdout.length).toBeLessThanOrEqual(100 * 1024);
  });

  it("runs in the configured scope by default", async () => {
    const result = await runCommandHandler(
      { command: "node", args: ["-e", "process.stdout.write(process.cwd())"] },
      configFor(scope),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(realpathSync(result.data.stdout)).toBe(scope);
  });

  it("rejects a `cwd` outside scope", async () => {
    await expect(
      runCommandHandler({ command: "node", args: [], cwd: "../" }, configFor(scope)),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("does not leak the parent process env to the child", async () => {
    process.env.MCP_DEVTOOLS_SECRET_TEST = "leaked";
    try {
      const result = await runCommandHandler(
        {
          command: "node",
          args: ["-e", "process.stdout.write(process.env.MCP_DEVTOOLS_SECRET_TEST ?? '<undef>')"],
        },
        configFor(scope),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.stdout).toBe("<undef>");
    } finally {
      delete process.env.MCP_DEVTOOLS_SECRET_TEST;
    }
  });

  it("forwards explicit env entries through", async () => {
    const result = await runCommandHandler(
      {
        command: "node",
        args: ["-e", "process.stdout.write(process.env.GREETING ?? '')"],
        env: { GREETING: "hello" },
      },
      configFor(scope),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stdout).toBe("hello");
  });

  it("rejects invalid env variable names", async () => {
    await expect(
      runCommandHandler(
        { command: "node", args: ["--version"], env: { "bad-name": "x" } },
        configFor(scope),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("escalates SIGKILL when SIGTERM is ignored", async () => {
    const start = Date.now();
    const result = await runCommandHandler(
      {
        command: "node",
        args: ["-e", "process.on('SIGTERM',()=>{}), setInterval(()=>{}, 100)"],
        timeoutMs: 200,
      },
      configFor(scope),
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.timedOut).toBe(true);
  });

  it("throws ConfigError when allowedCommands is empty", async () => {
    const cfg = McpDevtoolsConfigSchema.parse({ scope, allowedCommands: [] });
    await expect(runCommandHandler({ command: "node", args: [] }, cfg)).rejects.toThrow(
      /allowedCommands/,
    );
  });
});
