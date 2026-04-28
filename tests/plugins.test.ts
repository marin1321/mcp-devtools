import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { loadPlugins } from "../src/plugins.js";

describe("loadPlugins", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mcp-plugins-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when no plugins are specified", async () => {
    const result = await loadPlugins([], tempDir);
    expect(result).toEqual([]);
  });

  it("loads a valid plugin module", async () => {
    const pluginPath = join(tempDir, "valid-plugin.mjs");
    await writeFile(
      pluginPath,
      `
      import { z } from "zod";
      export default [
        {
          name: "test_tool",
          description: "A test plugin tool",
          inputSchema: z.object({ message: z.string() }),
          handler: async (input) => ({ ok: true, data: { echo: input.message } }),
        },
      ];
      `,
    );

    const result = await loadPlugins(["./valid-plugin.mjs"], tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("test_tool");
    expect(result[0].description).toBe("A test plugin tool");
    expect(typeof result[0].handler).toBe("function");
  });

  it("skips plugins with invalid exports", async () => {
    const pluginPath = join(tempDir, "invalid-export.mjs");
    await writeFile(pluginPath, `export default "not an array";`);

    const result = await loadPlugins(["./invalid-export.mjs"], tempDir);
    expect(result).toEqual([]);
  });

  it("skips plugins with missing default export", async () => {
    const pluginPath = join(tempDir, "no-default.mjs");
    await writeFile(pluginPath, `export const tools = [];`);

    const result = await loadPlugins(["./no-default.mjs"], tempDir);
    expect(result).toEqual([]);
  });

  it("skips missing modules without crashing", async () => {
    const result = await loadPlugins(["./nonexistent-plugin.mjs"], tempDir);
    expect(result).toEqual([]);
  });

  it("loads multiple plugins and flattens their tools", async () => {
    const pluginA = join(tempDir, "plugin-a.mjs");
    const pluginB = join(tempDir, "plugin-b.mjs");

    await writeFile(
      pluginA,
      `
      import { z } from "zod";
      export default [
        { name: "tool_a1", description: "Tool A1", inputSchema: z.object({}), handler: async () => ({ ok: true, data: {} }) },
        { name: "tool_a2", description: "Tool A2", inputSchema: z.object({}), handler: async () => ({ ok: true, data: {} }) },
      ];
      `,
    );
    await writeFile(
      pluginB,
      `
      import { z } from "zod";
      export default [
        { name: "tool_b1", description: "Tool B1", inputSchema: z.object({}), handler: async () => ({ ok: true, data: {} }) },
      ];
      `,
    );

    const result = await loadPlugins(
      ["./plugin-a.mjs", "./plugin-b.mjs"],
      tempDir,
    );
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.name)).toEqual(["tool_a1", "tool_a2", "tool_b1"]);
  });

  it("handles absolute paths", async () => {
    const pluginPath = join(tempDir, "absolute-plugin.mjs");
    await writeFile(
      pluginPath,
      `
      import { z } from "zod";
      export default [
        { name: "abs_tool", description: "Absolute path tool", inputSchema: z.object({}), handler: async () => ({ ok: true, data: {} }) },
      ];
      `,
    );

    const result = await loadPlugins([pluginPath], tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("abs_tool");
  });

  it("continues loading remaining plugins after one fails", async () => {
    const goodPlugin = join(tempDir, "good-after-bad.mjs");
    await writeFile(
      goodPlugin,
      `
      import { z } from "zod";
      export default [
        { name: "survivor", description: "Survives bad sibling", inputSchema: z.object({}), handler: async () => ({ ok: true, data: {} }) },
      ];
      `,
    );

    const result = await loadPlugins(
      ["./nonexistent.mjs", "./good-after-bad.mjs"],
      tempDir,
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("survivor");
  });
});
