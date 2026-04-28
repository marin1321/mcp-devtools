import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Builds a per-test scope tree under the OS temp directory:
 *
 * <tmp>/
 *   scope/                  <-- the "scope root" passed to filesystem tools
 *     inside.txt
 *     nested/
 *       inside.txt
 *     link-to-inside        -> inside.txt
 *     link-to-outside       -> ../outside/escape.txt
 *     loop                  -> loop  (self-referential)
 *   outside/
 *     escape.txt            <-- sibling, target of the escape symlink
 *
 * Returns the absolute scope root path plus a cleanup function. Tests should
 * call `cleanup()` in `afterEach` to remove the entire temp tree.
 *
 * Symlinks are created here (not committed) because they are platform-fragile
 * in git checkouts.
 */
export interface ScopeFixture {
  root: string;
  outsideRoot: string;
  files: {
    inside: string;
    nestedInside: string;
    linkToInside: string;
    linkToOutside: string;
    loop: string;
    outsideEscape: string;
  };
  cleanup: () => void;
}

export function createScopeFixture(): ScopeFixture {
  const tmpRootRaw = mkdtempSync(path.join(os.tmpdir(), "mcp-devtools-scope-"));
  // On macOS `os.tmpdir()` is `/var/folders/...` which is itself a symlink to
  // `/private/var/folders/...`. Canonicalize once so test expectations match
  // the value `resolveWithinScope` returns.
  const tmpRoot = realpathSync(tmpRootRaw);
  const scopeRoot = path.join(tmpRoot, "scope");
  const outsideRoot = path.join(tmpRoot, "outside");

  mkdirSync(scopeRoot, { recursive: true });
  mkdirSync(path.join(scopeRoot, "nested"), { recursive: true });
  mkdirSync(outsideRoot, { recursive: true });

  const inside = path.join(scopeRoot, "inside.txt");
  const nestedInside = path.join(scopeRoot, "nested", "inside.txt");
  const outsideEscape = path.join(outsideRoot, "escape.txt");
  const linkToInside = path.join(scopeRoot, "link-to-inside");
  const linkToOutside = path.join(scopeRoot, "link-to-outside");
  const loop = path.join(scopeRoot, "loop");

  writeFileSync(inside, "inside the scope\n");
  writeFileSync(nestedInside, "nested file\n");
  writeFileSync(outsideEscape, "should not be reachable\n");

  symlinkSync(inside, linkToInside);
  symlinkSync(outsideEscape, linkToOutside);
  symlinkSync(loop, loop);

  return {
    root: scopeRoot,
    outsideRoot,
    files: {
      inside,
      nestedInside,
      linkToInside,
      linkToOutside,
      loop,
      outsideEscape,
    },
    cleanup: () => {
      rmSync(tmpRoot, { recursive: true, force: true });
    },
  };
}
