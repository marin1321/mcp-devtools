import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertWithinScope,
  isWithinPath,
  pathIsHidden,
  resolveWithinScope,
} from "../../src/tools/filesystem/_utils.js";
import { FileSystemError, ScopeViolationError, ValidationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

describe("isWithinPath", () => {
  it("returns true when child is the parent itself", () => {
    expect(isWithinPath("/a/b", "/a/b")).toBe(true);
  });

  it("returns true for direct descendants", () => {
    expect(isWithinPath("/a/b", "/a/b/c.txt")).toBe(true);
  });

  it("returns true for deeper descendants", () => {
    expect(isWithinPath("/a/b", "/a/b/c/d/e.txt")).toBe(true);
  });

  it("returns false for siblings", () => {
    expect(isWithinPath("/a/b", "/a/c")).toBe(false);
  });

  it("returns false for parents", () => {
    expect(isWithinPath("/a/b", "/a")).toBe(false);
  });

  it("returns false for unrelated paths", () => {
    expect(isWithinPath("/a/b", "/x/y")).toBe(false);
  });
});

describe("pathIsHidden", () => {
  it("returns true for dotfiles", () => {
    expect(pathIsHidden(".env")).toBe(true);
    expect(pathIsHidden(".git")).toBe(true);
    expect(pathIsHidden(".cursor")).toBe(true);
  });

  it("returns false for non-dotfiles", () => {
    expect(pathIsHidden("README.md")).toBe(false);
    expect(pathIsHidden("dot.in.middle")).toBe(false);
    expect(pathIsHidden("not-hidden")).toBe(false);
  });

  it("returns false for the lone-dot edge case", () => {
    expect(pathIsHidden(".")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(pathIsHidden("")).toBe(false);
  });
});

describe("assertWithinScope (sync, no IO)", () => {
  const scope = path.resolve("/tmp/scope-test");

  it("returns the absolute path for relative inputs", () => {
    expect(assertWithinScope(scope, "foo.txt")).toBe(path.join(scope, "foo.txt"));
  });

  it("returns the absolute path for absolute inputs inside scope", () => {
    expect(assertWithinScope(scope, path.join(scope, "foo.txt"))).toBe(path.join(scope, "foo.txt"));
  });

  it("throws ScopeViolationError for absolute paths outside scope", () => {
    expect(() => assertWithinScope(scope, "/etc/passwd")).toThrow(ScopeViolationError);
  });

  it("throws ScopeViolationError for path traversal that escapes scope", () => {
    expect(() => assertWithinScope(scope, "../../../etc/passwd")).toThrow(ScopeViolationError);
  });

  it("allows path traversal that stays inside scope", () => {
    expect(assertWithinScope(scope, "a/b/../c.txt")).toBe(path.join(scope, "a", "c.txt"));
  });

  it("normalizes trailing slashes", () => {
    expect(assertWithinScope(scope, "a/b/")).toBe(path.join(scope, "a", "b"));
  });

  it("does not touch the filesystem (works on non-existent paths)", () => {
    const nonExistent = path.join(scope, "definitely", "does", "not", "exist.txt");
    expect(assertWithinScope(scope, "definitely/does/not/exist.txt")).toBe(nonExistent);
  });

  it("rejects empty input as ValidationError", () => {
    expect(() => assertWithinScope(scope, "")).toThrow(ValidationError);
  });

  it("rejects null-byte input as ValidationError", () => {
    expect(() => assertWithinScope(scope, "foo\u0000bar")).toThrow(ValidationError);
  });
});

describe("resolveWithinScope (async, follows symlinks)", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("returns the resolved path for an existing file inside scope", async () => {
    const result = await resolveWithinScope(fixture.root, "inside.txt");
    expect(result).toBe(fixture.files.inside);
  });

  it("returns the resolved path for nested files", async () => {
    const result = await resolveWithinScope(fixture.root, "nested/inside.txt");
    expect(result).toBe(fixture.files.nestedInside);
  });

  it("follows a symlink whose target stays inside scope", async () => {
    const result = await resolveWithinScope(fixture.root, "link-to-inside");
    expect(result).toBe(fixture.files.inside);
  });

  it("rejects a symlink whose target escapes scope", async () => {
    await expect(resolveWithinScope(fixture.root, "link-to-outside")).rejects.toBeInstanceOf(
      ScopeViolationError,
    );
  });

  it("returns the lexical path for a non-existent file inside scope (no realpath)", async () => {
    const result = await resolveWithinScope(fixture.root, "does-not-exist.txt");
    expect(result).toBe(path.join(fixture.root, "does-not-exist.txt"));
  });

  it("rejects an absolute path outside scope", async () => {
    await expect(resolveWithinScope(fixture.root, "/etc/passwd")).rejects.toBeInstanceOf(
      ScopeViolationError,
    );
  });

  it("rejects a path that traverses out of scope", async () => {
    await expect(resolveWithinScope(fixture.root, "../outside/escape.txt")).rejects.toBeInstanceOf(
      ScopeViolationError,
    );
  });

  it("maps symlink loops (ELOOP) to FileSystemError", async () => {
    await expect(resolveWithinScope(fixture.root, "loop")).rejects.toBeInstanceOf(FileSystemError);
  });

  it("rejects empty input as ValidationError", async () => {
    await expect(resolveWithinScope(fixture.root, "")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects null-byte input as ValidationError", async () => {
    await expect(resolveWithinScope(fixture.root, "foo\u0000bar")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
