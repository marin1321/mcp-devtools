import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ConfigError } from "../src/types/errors.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mcp-config-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MCP_DEVTOOLS_CONFIG;
});

describe("loadConfig", () => {
  it("falls back to schema defaults when no config file is found", async () => {
    const cfg = await loadConfig(dir);
    expect(cfg.scope).toBe("./");
    expect(cfg.transport).toBe("stdio");
    expect(cfg.allowedCommands).toContain("npm");
  });

  it("loads config from an explicit path via MCP_DEVTOOLS_CONFIG", async () => {
    const file = path.join(dir, "mcp-devtools.json");
    writeFileSync(
      file,
      JSON.stringify({
        scope: "/tmp/somewhere",
        allowedCommands: ["bash"],
        transport: "stdio",
      }),
    );
    process.env.MCP_DEVTOOLS_CONFIG = file;
    const cfg = await loadConfig(dir);
    expect(cfg.scope).toBe("/tmp/somewhere");
    expect(cfg.allowedCommands).toEqual(["bash"]);
  });

  it("rejects an invalid config with a ConfigError", async () => {
    const file = path.join(dir, "mcp-devtools.json");
    writeFileSync(file, JSON.stringify({ port: "not-a-number" }));
    process.env.MCP_DEVTOOLS_CONFIG = file;
    await expect(loadConfig(dir)).rejects.toBeInstanceOf(ConfigError);
  });

  it("loads config discovered in the cwd", async () => {
    writeFileSync(
      path.join(dir, "mcp-devtools.json"),
      JSON.stringify({ scope: "./custom-scope", port: 4444 }),
    );
    const cfg = await loadConfig(dir);
    expect(cfg.scope).toBe("./custom-scope");
    expect(cfg.port).toBe(4444);
  });
});
