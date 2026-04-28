import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readFileHandler } from "../../src/tools/filesystem/read-file.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import {
  FileSystemError,
  ScopeViolationError,
  ValidationError,
} from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

describe("readFileHandler", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("reads a small text file in full", async () => {
    const filePath = path.join(fixture.root, "hello.txt");
    writeFileSync(filePath, "line1\nline2\nline3\n");

    const result = await readFileHandler({ path: "hello.txt" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.content).toBe("line1\nline2\nline3\n");
    expect(result.data.lineCount).toBe(3);
    expect(result.data.encoding).toBe("utf-8");
    expect(result.data.truncated).toBe(false);
  });

  it("returns 0 lines and empty content for an empty file", async () => {
    const filePath = path.join(fixture.root, "empty.txt");
    writeFileSync(filePath, "");

    const result = await readFileHandler({ path: "empty.txt" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.content).toBe("");
    expect(result.data.lineCount).toBe(0);
  });

  it("strips a UTF-8 BOM and surfaces it via encoding", async () => {
    const filePath = path.join(fixture.root, "bom.txt");
    writeFileSync(filePath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hi\n")]));

    const result = await readFileHandler({ path: "bom.txt" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.content).toBe("hi\n");
    expect(result.data.encoding).toBe("utf-8-bom");
  });

  it("returns the requested inclusive line range", async () => {
    const filePath = path.join(fixture.root, "many.txt");
    const lines = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join("\n");
    writeFileSync(filePath, lines);

    const result = await readFileHandler(
      { path: "many.txt", startLine: 10, endLine: 20 },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const collected = result.data.content.split("\n");
    expect(collected).toHaveLength(11);
    expect(collected[0]).toBe("line10");
    expect(collected[10]).toBe("line20");
  });

  it("returns from startLine to EOF when endLine is omitted", async () => {
    const filePath = path.join(fixture.root, "tail.txt");
    writeFileSync(filePath, "a\nb\nc\nd\n");

    const result = await readFileHandler(
      { path: "tail.txt", startLine: 3 },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.content).toBe("c\nd");
  });

  it("throws ValidationError when startLine > endLine", async () => {
    const filePath = path.join(fixture.root, "x.txt");
    writeFileSync(filePath, "a\nb\n");

    await expect(
      readFileHandler({ path: "x.txt", startLine: 5, endLine: 2 }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws FileSystemError when startLine exceeds total line count", async () => {
    const filePath = path.join(fixture.root, "small.txt");
    writeFileSync(filePath, "only-line\n");

    await expect(
      readFileHandler({ path: "small.txt", startLine: 100 }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("rejects an absolute path outside the scope", async () => {
    await expect(
      readFileHandler({ path: "/etc/passwd" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects a symlink that escapes scope", async () => {
    await expect(
      readFileHandler({ path: "link-to-outside" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects directories with EISDIR", async () => {
    mkdirSync(path.join(fixture.root, "dir"), { recursive: true });
    await expect(
      readFileHandler({ path: "dir" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("rejects non-existent files with FileSystemError", async () => {
    await expect(
      readFileHandler({ path: "ghost.txt" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("rejects binary files with FileSystemError", async () => {
    const binPath = path.join(fixture.root, "blob.bin");
    writeFileSync(binPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));

    await expect(
      readFileHandler({ path: "blob.bin" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("truncates files larger than MAX_FILE_BYTES and flags it", async () => {
    const filePath = path.join(fixture.root, "huge.txt");
    const oneMb = 1024 * 1024;
    const big = Buffer.alloc(oneMb + 1024, 0x61); // 1 MB + 1 KB of 'a'
    writeFileSync(filePath, big);

    const result = await readFileHandler({ path: "huge.txt" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.truncated).toBe(true);
    expect(result.data.content.length).toBe(oneMb);
  });

  it("reads a 100 KB file in well under 100ms", async () => {
    const filePath = path.join(fixture.root, "perf.txt");
    const lines = Array.from({ length: 2000 }, (_, i) => `line ${i + 1}`).join("\n");
    writeFileSync(filePath, lines);

    const start = performance.now();
    const result = await readFileHandler({ path: "perf.txt" }, configFor(fixture.root));
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});
