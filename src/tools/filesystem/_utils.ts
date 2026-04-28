import { realpath } from "node:fs/promises";
import path from "node:path";

import { FileSystemError, ScopeViolationError, ValidationError } from "../../types/errors.js";

/**
 * Pure, synchronous containment check: is `child` inside `parent`?
 *
 * Both arguments must be absolute, normalized paths. Returns `true` when the
 * child is the parent itself or a descendant. Used as the primary scope
 * boundary (RNF-02).
 */
export function isWithinPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Returns `true` when `name` is a POSIX hidden file (leading dot). Does not
 * inspect the filesystem; pass a basename, not a full path.
 */
export function pathIsHidden(name: string): boolean {
  return name.length > 1 && name.startsWith(".");
}

/**
 * Synchronous, no-IO scope check.
 *
 * Use this when the target path may not exist yet (e.g. `write_file`'s
 * destination). It only resolves the path lexically — symlinks are NOT
 * followed because there's nothing to follow yet.
 *
 * Throws {@link ScopeViolationError} if the resolved path escapes scope, and
 * {@link ValidationError} for malformed input (empty string, null byte).
 */
export function assertWithinScope(scopeRoot: string, candidate: string): string {
  validateInputPath(candidate);
  const absoluteScope = path.resolve(scopeRoot);
  const resolved = path.resolve(absoluteScope, candidate);
  if (!isWithinPath(absoluteScope, resolved)) {
    throw new ScopeViolationError(`Path is outside the configured scope: ${candidate}`, {
      scope: absoluteScope,
      requested: resolved,
    });
  }
  return resolved;
}

/**
 * Async scope check that follows symlinks.
 *
 * Returns the absolute resolved path (the real path if the target exists, or
 * the lexically-resolved path if it doesn't yet). Used by every read-side
 * filesystem tool.
 *
 * Throws:
 * - {@link ValidationError} for malformed input (empty / null byte)
 * - {@link ScopeViolationError} if either the lexical path or the symlink
 *   target escapes scope
 * - {@link FileSystemError} for symlink loops (ELOOP) and other realpath
 *   failures that aren't ENOENT
 */
export async function resolveWithinScope(
  scopeRoot: string,
  relativeOrAbsolute: string,
): Promise<string> {
  const candidate = assertWithinScope(scopeRoot, relativeOrAbsolute);
  // Resolve the scope itself through symlinks so the post-realpath comparison
  // works on platforms where the temp dir or workspace lives behind a symlink
  // (e.g. macOS `/var` -> `/private/var`).
  const realScope = await safeRealpath(path.resolve(scopeRoot));

  try {
    const real = await realpath(candidate);
    if (!isWithinPath(realScope, real)) {
      throw new ScopeViolationError(`Symlink target escapes scope: ${relativeOrAbsolute}`, {
        scope: realScope,
        target: real,
      });
    }
    return real;
  } catch (error) {
    if (error instanceof ScopeViolationError) {
      throw error;
    }
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      return candidate;
    }
    if (errno.code === "ELOOP") {
      throw new FileSystemError(`Symlink loop detected: ${relativeOrAbsolute}`, {
        path: candidate,
        cause: errno.code,
      });
    }
    throw new FileSystemError(`Failed to resolve path: ${relativeOrAbsolute}`, {
      path: candidate,
      cause: errno.code ?? "UNKNOWN",
    });
  }
}

async function safeRealpath(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return p;
  }
}

function validateInputPath(input: string): void {
  if (typeof input !== "string" || input.length === 0) {
    throw new ValidationError("Path must be a non-empty string");
  }
  if (input.includes("\u0000")) {
    throw new ValidationError("Path must not contain null bytes", { input });
  }
}
