import { opendir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import picomatch from "picomatch";
import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";
import { logger } from "../../utils/logger.js";

import { DEFAULT_IGNORE_DIRS, MAX_DIR_ENTRIES } from "./_constants.js";
import { pathIsHidden, resolveWithinScope } from "./_utils.js";

export const ListDirectoryInput = z.object({
  path: z.string().min(1).default("."),
  depth: z.number().int().min(0).max(20).default(1),
  glob: z.string().optional(),
  includeHidden: z.boolean().default(false),
});

export type ListDirectoryInput = z.infer<typeof ListDirectoryInput>;

export interface DirectoryEntry {
  /** Path relative to the input directory, using forward slashes. */
  path: string;
  type: "file" | "directory" | "symlink";
  /** File size in bytes; 0 for directories and symlinks. */
  size: number;
  /** ISO-8601 mtime of the entry. */
  modifiedAt: string;
}

export interface ListDirectoryOutput {
  /** Path of the listed directory, relative to the configured scope root. */
  root: string;
  entries: DirectoryEntry[];
  truncated: boolean;
}

/**
 * Walks `input.path` recursively up to `input.depth` levels, applying glob
 * filtering and hidden/ignored-directory exclusion.
 *
 * Result paths are returned relative to the input directory (forward
 * slashes), never absolute, so they're stable across host filesystems.
 */
export async function listDirectoryHandler(
  input: ListDirectoryInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<ListDirectoryOutput>> {
  const realPath = await resolveWithinScope(config.scope, input.path);
  const stats = await stat(realPath);
  if (!stats.isDirectory()) {
    throw new FileSystemError("Path is not a directory", {
      path: input.path,
      code: "ENOTDIR",
    });
  }

  const matcher =
    input.glob !== undefined && input.glob.length > 0
      ? picomatch(input.glob, { dot: input.includeHidden })
      : null;
  const visited = new Set<string>([realPath]);
  const entries: DirectoryEntry[] = [];
  const state = { truncated: false };

  await walk(realPath, "", 0, input, visited, entries, state, matcher);

  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return ok({
    root: input.path,
    entries,
    truncated: state.truncated,
  });
}

async function walk(
  absoluteDir: string,
  relativeDir: string,
  currentDepth: number,
  input: ListDirectoryInput,
  visited: Set<string>,
  out: DirectoryEntry[],
  state: { truncated: boolean },
  matcher: ReturnType<typeof picomatch> | null,
): Promise<void> {
  if (state.truncated) {
    return;
  }

  let dir;
  try {
    dir = await opendir(absoluteDir);
  } catch (error) {
    throw mapFsError(error, absoluteDir);
  }

  try {
    for await (const entry of dir) {
      if (out.length >= MAX_DIR_ENTRIES) {
        state.truncated = true;
        return;
      }

      const name = entry.name;
      if (!input.includeHidden && pathIsHidden(name)) {
        continue;
      }

      const isDir = entry.isDirectory();
      const isSymlink = entry.isSymbolicLink();
      const type: DirectoryEntry["type"] = isSymlink ? "symlink" : isDir ? "directory" : "file";
      const relPath = relativeDir === "" ? name : `${relativeDir}/${name}`;
      const absPath = path.join(absoluteDir, name);

      const matches = matcher === null || matcher(relPath);

      if (matches) {
        let size = 0;
        let modifiedAt = "1970-01-01T00:00:00.000Z";
        try {
          const st = isSymlink ? await stat(absPath).catch(() => null) : await stat(absPath);
          if (st !== null) {
            size = st.isFile() ? st.size : 0;
            modifiedAt = st.mtime.toISOString();
          }
        } catch {
          // best-effort: unreadable entries are surfaced with default values
        }
        out.push({ path: relPath, type, size, modifiedAt });
      }

      if (isDir && currentDepth < input.depth) {
        if (DEFAULT_IGNORE_DIRS.has(name)) {
          continue;
        }
        let realChild: string;
        try {
          realChild = await realpath(absPath);
        } catch {
          continue;
        }
        if (visited.has(realChild)) {
          logger.debug({ path: realChild }, "skipping symlink loop");
          continue;
        }
        visited.add(realChild);
        await walk(realChild, relPath, currentDepth + 1, input, visited, out, state, matcher);
      }
    }
  } finally {
    await dir.close().catch(() => undefined);
  }
}

function mapFsError(error: unknown, attemptedPath: string): FileSystemError {
  const errno = error as NodeJS.ErrnoException;
  return new FileSystemError(`Failed to read directory: ${errno.message ?? "unknown error"}`, {
    path: attemptedPath,
    code: errno.code ?? "UNKNOWN",
  });
}
