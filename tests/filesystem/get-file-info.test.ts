import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getFileInfoHandler } from "../../src/tools/filesystem/get-file-info.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { FileSystemError, ScopeViolationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

describe("getFileInfoHandler", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("returns metadata for a text file with line count and mime", async () => {
    const file = path.join(fixture.root, "sample.txt");
    writeFileSync(file, "alpha\nbeta\ngamma\n");
    const result = await getFileInfoHandler({ path: "sample.txt" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("file");
    expect(result.data.size).toBe(17);
    expect(result.data.lines).toBe(3);
    expect(result.data.mime).toBe("text/plain");
    expect(result.data.isSymlink).toBe(false);
  });

  it("does not return lines for a binary file", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    writeFileSync(path.join(fixture.root, "img.png"), png);
    const result = await getFileInfoHandler({ path: "img.png" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toBeUndefined();
    expect(result.data.mime).toBe("image/png");
  });

  it("describes a directory", async () => {
    mkdirSync(path.join(fixture.root, "adir"));
    const result = await getFileInfoHandler({ path: "adir" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("directory");
    expect(result.data.lines).toBeUndefined();
    expect(result.data.mime).toBeNull();
  });

  it("describes a symlink to an in-scope file", async () => {
    const result = await getFileInfoHandler({ path: "link-to-inside" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("symlink");
    expect(result.data.isSymlink).toBe(true);
    expect(result.data.linkTarget).toBeDefined();
    expect(result.data.linkEscapesScope).toBe(false);
  });

  it("flags a symlink whose target escapes scope without throwing", async () => {
    const result = await getFileInfoHandler({ path: "link-to-outside" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isSymlink).toBe(true);
    expect(result.data.linkEscapesScope).toBe(true);
  });

  it("rejects an out-of-scope path", async () => {
    await expect(
      getFileInfoHandler({ path: "/etc/hosts" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("rejects a non-existent path", async () => {
    await expect(
      getFileInfoHandler({ path: "does-not-exist.txt" }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("returns mime: null for unknown extensions and no line count", async () => {
    writeFileSync(path.join(fixture.root, "blob.qqzz"), Buffer.from([0xff, 0xfe, 0xfd]));
    const result = await getFileInfoHandler({ path: "blob.qqzz" }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mime).toBeNull();
    expect(result.data.lines).toBeUndefined();
  });
});
