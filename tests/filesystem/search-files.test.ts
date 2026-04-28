import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { searchFilesHandler } from "../../src/tools/filesystem/search-files.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { ScopeViolationError, ValidationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

function buildSearchTree(root: string): void {
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src", "a.ts"), "const greet = 'hello';\nconst world = 'WORLD';\n");
  writeFileSync(
    path.join(root, "src", "b.ts"),
    "function hello(name) {\n  return name + ' world';\n}\n",
  );
  writeFileSync(
    path.join(root, "src", "c.md"),
    "# Hello world\n\nThis is a paragraph.\nHELLO again.\n",
  );

  mkdirSync(path.join(root, "node_modules", "lib"), { recursive: true });
  writeFileSync(path.join(root, "node_modules", "lib", "index.js"), "module.exports = 'hello';\n");

  mkdirSync(path.join(root, ".git"), { recursive: true });
  writeFileSync(path.join(root, ".git", "HEAD"), "hello git ref\n");

  writeFileSync(path.join(root, ".env"), "TOKEN=hello-secret\n");

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  writeFileSync(path.join(root, "image.png"), png);
}

describe("searchFilesHandler", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
    buildSearchTree(fixture.root);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("matches a literal pattern across multiple files", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "hello",
        path: "src",
        regex: false,
        caseInsensitive: true,
        contextLines: 0,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const files = new Set(result.data.matches.map((m) => m.file));
    expect(files.has("a.ts")).toBe(true);
    expect(files.has("b.ts")).toBe(true);
    expect(files.has("c.md")).toBe(true);
  });

  it("supports regex with metacharacters", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "function\\s+\\w+",
        path: "src",
        regex: true,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.some((m) => m.file === "b.ts")).toBe(true);
  });

  it("matches case-insensitively when requested", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "world",
        path: "src",
        regex: false,
        caseInsensitive: true,
        contextLines: 0,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = result.data.matches.map((m) => m.match);
    expect(lines.some((l) => l.includes("WORLD"))).toBe(true);
    expect(lines.some((l) => l.includes("world"))).toBe(true);
  });

  it("rejects an invalid regex with VALIDATION_ERROR", async () => {
    await expect(
      searchFilesHandler(
        {
          pattern: "(unclosed",
          path: "src",
          regex: true,
          caseInsensitive: false,
          contextLines: 0,
          maxResults: 100,
          includeHidden: false,
        },
        configFor(fixture.root),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns context lines before and after each match", async () => {
    writeFileSync(
      path.join(fixture.root, "src", "ctx.txt"),
      ["line 1", "line 2", "TARGET", "line 4", "line 5"].join("\n"),
    );
    const result = await searchFilesHandler(
      {
        pattern: "TARGET",
        path: "src",
        regex: false,
        caseInsensitive: false,
        contextLines: 2,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const m = result.data.matches.find((x) => x.file === "ctx.txt");
    expect(m).toBeDefined();
    expect(m!.before).toEqual(["line 1", "line 2"]);
    expect(m!.after).toEqual(["line 4", "line 5"]);
  });

  it("returns shorter context arrays at file boundaries", async () => {
    writeFileSync(path.join(fixture.root, "src", "edge.txt"), "FIRST\nsecond\n");
    const result = await searchFilesHandler(
      {
        pattern: "FIRST",
        path: "src",
        regex: false,
        caseInsensitive: false,
        contextLines: 3,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const m = result.data.matches.find((x) => x.file === "edge.txt");
    expect(m).toBeDefined();
    expect(m!.before).toEqual([]);
    expect(m!.after).toEqual(["second"]);
  });

  it("caps results at maxResults and reports truncated=true", async () => {
    const dir = path.join(fixture.root, "many");
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 20; i += 1) {
      writeFileSync(path.join(dir, `f${i}.txt`), "needle\n");
    }
    const result = await searchFilesHandler(
      {
        pattern: "needle",
        path: "many",
        regex: false,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 5,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.length).toBe(5);
    expect(result.data.truncated).toBe(true);
  });

  it("skips binary files silently", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "PNG",
        path: ".",
        regex: false,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.find((m) => m.file === "image.png")).toBeUndefined();
  });

  it("skips node_modules by default", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "hello",
        path: ".",
        regex: false,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.some((m) => m.file.startsWith("node_modules"))).toBe(false);
  });

  it("skips .git by default", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "hello",
        path: ".",
        regex: false,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 100,
        includeHidden: true,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.some((m) => m.file.startsWith(".git"))).toBe(false);
  });

  it("honors a glob filter", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "hello",
        path: ".",
        glob: "src/**/*.ts",
        regex: false,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 100,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.every((m) => m.file.endsWith(".ts"))).toBe(true);
    expect(result.data.matches.some((m) => m.file === "c.md")).toBe(false);
  });

  it("searches hidden files when includeHidden=true", async () => {
    const result = await searchFilesHandler(
      {
        pattern: "TOKEN",
        path: ".",
        regex: false,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 100,
        includeHidden: true,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.some((m) => m.file === ".env")).toBe(true);
  });

  it("rejects out-of-scope start path", async () => {
    await expect(
      searchFilesHandler(
        {
          pattern: "x",
          path: "/etc",
          regex: false,
          caseInsensitive: false,
          contextLines: 0,
          maxResults: 100,
          includeHidden: false,
        },
        configFor(fixture.root),
      ),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("stops early on a match-everything pattern (perf)", async () => {
    const dir = path.join(fixture.root, "big");
    mkdirSync(dir, { recursive: true });
    const lines: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      lines.push(`line ${i} matches always`);
    }
    writeFileSync(path.join(dir, "big.txt"), lines.join("\n"));
    const start = performance.now();
    const result = await searchFilesHandler(
      {
        pattern: "matches",
        path: "big",
        regex: false,
        caseInsensitive: false,
        contextLines: 0,
        maxResults: 50,
        includeHidden: false,
      },
      configFor(fixture.root),
    );
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.truncated).toBe(true);
    expect(result.data.matches.length).toBe(50);
    expect(elapsed).toBeLessThan(500);
  });
});
