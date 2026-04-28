import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listDirectoryHandler } from "../../src/tools/filesystem/list-directory.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { FileSystemError, ScopeViolationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

function createTree(root: string): void {
  writeFileSync(path.join(root, "a.txt"), "a");
  writeFileSync(path.join(root, "b.txt"), "b");
  writeFileSync(path.join(root, "c.md"), "c");
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "src", "index.ts"), "// ts");
  writeFileSync(path.join(root, "src", "helper.ts"), "// ts");
  mkdirSync(path.join(root, "src", "deep"));
  writeFileSync(path.join(root, "src", "deep", "nested.ts"), "// deep ts");
  writeFileSync(path.join(root, ".env"), "SECRET=1");
  mkdirSync(path.join(root, ".git"));
  writeFileSync(path.join(root, ".git", "HEAD"), "ref");
}

describe("listDirectoryHandler", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("returns immediate entries with depth=0", async () => {
    createTree(fixture.root);
    const result = await listDirectoryHandler(
      { path: ".", depth: 0, includeHidden: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.data.entries.map((e) => e.path).sort();
    expect(names).toEqual([
      "a.txt",
      "b.txt",
      "c.md",
      "inside.txt",
      "link-to-inside",
      "link-to-outside",
      "loop",
      "nested",
      "src",
    ]);
    expect(result.data.truncated).toBe(false);
  });

  it("recurses with depth=2", async () => {
    createTree(fixture.root);
    const result = await listDirectoryHandler(
      { path: ".", depth: 2, includeHidden: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.data.entries.map((e) => e.path);
    expect(names).toContain("src/index.ts");
    expect(names).toContain("src/deep/nested.ts");
  });

  it("filters by glob pattern", async () => {
    createTree(fixture.root);
    const result = await listDirectoryHandler(
      { path: ".", depth: 5, glob: "**/*.ts", includeHidden: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.data.entries.map((e) => e.path).sort();
    expect(names).toEqual(["src/deep/nested.ts", "src/helper.ts", "src/index.ts"]);
  });

  it("excludes hidden entries by default", async () => {
    createTree(fixture.root);
    const result = await listDirectoryHandler(
      { path: ".", depth: 0, includeHidden: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.data.entries.map((e) => e.path);
    expect(names).not.toContain(".env");
    expect(names).not.toContain(".git");
  });

  it("includes hidden entries when includeHidden=true", async () => {
    createTree(fixture.root);
    const result = await listDirectoryHandler(
      { path: ".", depth: 0, includeHidden: true },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.data.entries.map((e) => e.path);
    expect(names).toContain(".env");
    expect(names).toContain(".git");
  });

  it("rejects an out-of-scope path", async () => {
    await expect(
      listDirectoryHandler({ path: "/etc", depth: 0, includeHidden: false }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects a path that points to a file", async () => {
    writeFileSync(path.join(fixture.root, "a.txt"), "a");
    await expect(
      listDirectoryHandler({ path: "a.txt", depth: 0, includeHidden: false }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("caps results at MAX_DIR_ENTRIES (5000) and reports truncated=true", async () => {
    const dir = path.join(fixture.root, "many");
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 5005; i += 1) {
      writeFileSync(path.join(dir, `f${String(i).padStart(5, "0")}.txt`), "x");
    }
    const result = await listDirectoryHandler(
      { path: "many", depth: 0, includeHidden: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.truncated).toBe(true);
    expect(result.data.entries.length).toBe(5000);
  });

  it(
    "does not hang on a symlink loop",
    async () => {
      const loopDir = path.join(fixture.root, "loop-dir");
      mkdirSync(loopDir, { recursive: true });
      symlinkSync(loopDir, path.join(loopDir, "self"));
      const result = await listDirectoryHandler(
        { path: "loop-dir", depth: 5, includeHidden: false },
        configFor(fixture.root),
      );
      expect(result.ok).toBe(true);
    },
    5000,
  );

  it("lists 1000 files in well under 200ms", async () => {
    const dir = path.join(fixture.root, "perf");
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 1000; i += 1) {
      writeFileSync(path.join(dir, `f${String(i).padStart(4, "0")}.txt`), "x");
    }
    const start = performance.now();
    const result = await listDirectoryHandler(
      { path: "perf", depth: 0, includeHidden: false },
      configFor(fixture.root),
    );
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries.length).toBe(1000);
    expect(elapsed).toBeLessThan(200);
  });

  it("returns alphabetically sorted entries (deterministic)", async () => {
    writeFileSync(path.join(fixture.root, "zeta.txt"), "z");
    writeFileSync(path.join(fixture.root, "alpha.txt"), "a");
    writeFileSync(path.join(fixture.root, "mu.txt"), "m");
    const result = await listDirectoryHandler(
      { path: ".", depth: 0, includeHidden: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const myFiles = result.data.entries
      .map((e) => e.path)
      .filter((p) => p === "alpha.txt" || p === "mu.txt" || p === "zeta.txt");
    expect(myFiles).toEqual(["alpha.txt", "mu.txt", "zeta.txt"]);
  });
});
