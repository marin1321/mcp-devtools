import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type * as FsPromisesNs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { writeFileHandler } from "../../src/tools/filesystem/write-file.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { FileSystemError, ScopeViolationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof FsPromisesNs>("node:fs/promises");
  return { ...actual, rename: vi.fn(actual.rename) };
});

const { rename: mockedRename } = (await import("node:fs/promises")) as {
  rename: Mock;
};

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

describe("writeFileHandler (atomic semantics)", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
    vi.restoreAllMocks();
  });

  it("creates a brand-new file and reports created=true", async () => {
    const result = await writeFileHandler(
      { path: "new.txt", content: "hello", encoding: "utf-8", createDirs: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created).toBe(true);
    expect(result.data.bytesWritten).toBe(5);
    expect(readFileSync(path.join(fixture.root, "new.txt"), "utf-8")).toBe("hello");
  });

  it("overwrites an existing file and reports created=false", async () => {
    const filePath = path.join(fixture.root, "exists.txt");
    writeFileSync(filePath, "old");

    const result = await writeFileHandler(
      { path: "exists.txt", content: "new", encoding: "utf-8", createDirs: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created).toBe(false);
    expect(readFileSync(filePath, "utf-8")).toBe("new");
  });

  it("creates intermediate directories when createDirs=true", async () => {
    const result = await writeFileHandler(
      {
        path: "a/b/c/deep.txt",
        content: "nested",
        encoding: "utf-8",
        createDirs: true,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(fixture.root, "a/b/c/deep.txt"), "utf-8")).toBe("nested");
  });

  it("refuses to write when the parent does not exist and createDirs=false", async () => {
    await expect(
      writeFileHandler(
        { path: "missing/parent.txt", content: "x", encoding: "utf-8", createDirs: false },
        configFor(fixture.root),
      ),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("round-trips a binary payload via base64", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = await writeFileHandler(
      {
        path: "tiny.bin",
        content: bytes.toString("base64"),
        encoding: "base64",
        createDirs: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(fixture.root, "tiny.bin"))).toEqual(bytes);
  });

  it("rejects an absolute path outside scope", async () => {
    await expect(
      writeFileHandler(
        { path: "/etc/passwd", content: "x", encoding: "utf-8", createDirs: false },
        configFor(fixture.root),
      ),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects writing over an existing directory", async () => {
    mkdirSync(path.join(fixture.root, "a-dir"), { recursive: true });
    await expect(
      writeFileHandler(
        { path: "a-dir", content: "x", encoding: "utf-8", createDirs: false },
        configFor(fixture.root),
      ),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("cleans up the temp file when rename fails (atomicity)", async () => {
    const filePath = path.join(fixture.root, "atomic.txt");
    writeFileSync(filePath, "original");

    mockedRename.mockRejectedValueOnce(Object.assign(new Error("disk full"), { code: "ENOSPC" }));

    await expect(
      writeFileHandler(
        { path: "atomic.txt", content: "should-not-stick", encoding: "utf-8", createDirs: false },
        configFor(fixture.root),
      ),
    ).rejects.toBeInstanceOf(FileSystemError);

    expect(mockedRename).toHaveBeenCalled();
    expect(readFileSync(filePath, "utf-8")).toBe("original");
    const leftover = readdirSync(fixture.root).filter((name) => name.startsWith("atomic.txt.tmp."));
    expect(leftover).toEqual([]);
  });

  it("does not leave a temp file when concurrent writes race to the same path", async () => {
    const writes = [
      writeFileHandler(
        { path: "race.txt", content: "A".repeat(100), encoding: "utf-8", createDirs: false },
        configFor(fixture.root),
      ),
      writeFileHandler(
        { path: "race.txt", content: "B".repeat(100), encoding: "utf-8", createDirs: false },
        configFor(fixture.root),
      ),
    ];
    const results = await Promise.all(writes);
    expect(results.every((r) => r.ok)).toBe(true);

    const final = readFileSync(path.join(fixture.root, "race.txt"), "utf-8");
    expect(final === "A".repeat(100) || final === "B".repeat(100)).toBe(true);

    const orphans = readdirSync(fixture.root).filter((n) => n.startsWith("race.txt.tmp."));
    expect(orphans).toEqual([]);
  });

  it("does not leave any orphan temp files at the end of the suite", () => {
    const orphans = readdirSync(fixture.root).filter((n) => n.includes(".tmp."));
    expect(orphans).toEqual([]);
    expect(existsSync(fixture.root)).toBe(true);
  });

  it("round-trips a hex-encoded payload", async () => {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const result = await writeFileHandler(
      {
        path: "tiny.hex",
        content: bytes.toString("hex"),
        encoding: "hex",
        createDirs: false,
      },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(fixture.root, "tiny.hex"))).toEqual(bytes);
  });

  it("round-trips an ascii payload", async () => {
    const result = await writeFileHandler(
      { path: "ascii.txt", content: "ascii-only", encoding: "ascii", createDirs: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(fixture.root, "ascii.txt"), "ascii")).toBe("ascii-only");
  });

  it("accepts the explicit `utf8` alias (no hyphen)", async () => {
    const result = await writeFileHandler(
      { path: "alias.txt", content: "ñ", encoding: "utf8", createDirs: false },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(fixture.root, "alias.txt"), "utf-8")).toBe("ñ");
  });
});
