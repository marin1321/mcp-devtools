import { realpath } from "node:fs/promises";
import path from "node:path";

import { ScopeViolationError } from "../../types/errors.js";

/**
 * Resolve `relativeOrAbsolute` against the configured scope root and return
 * an absolute path. Throws `ScopeViolationError` if the path escapes scope,
 * including via symlinks (RNF-02).
 */
export async function resolveWithinScope(
  scopeRoot: string,
  relativeOrAbsolute: string,
): Promise<string> {
  const absoluteScope = path.resolve(scopeRoot);
  const candidate = path.resolve(absoluteScope, relativeOrAbsolute);

  if (!isInside(absoluteScope, candidate)) {
    throw new ScopeViolationError(`Path is outside the configured scope: ${relativeOrAbsolute}`, {
      scope: absoluteScope,
      requested: candidate,
    });
  }

  try {
    const real = await realpath(candidate);
    if (!isInside(absoluteScope, real)) {
      throw new ScopeViolationError(`Symlink target escapes scope: ${relativeOrAbsolute}`, {
        scope: absoluteScope,
        target: real,
      });
    }
    return real;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return candidate;
    }
    throw error;
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
