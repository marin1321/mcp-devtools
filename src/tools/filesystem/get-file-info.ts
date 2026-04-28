import { createReadStream } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import mime from "mime-types";
import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { assertWithinScope, isWithinPath } from "./_utils.js";

const MAX_FILE_SIZE_FOR_LINE_COUNT = 10 * 1024 * 1024;

const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".markdown",
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".sh",
  ".bash",
  ".zsh",
  ".html",
  ".css",
  ".scss",
  ".sql",
  ".env",
  ".ini",
  ".conf",
  ".log",
  ".xml",
]);

export const GetFileInfoInput = z.object({
  path: z.string().min(1),
});

export type GetFileInfoInput = z.infer<typeof GetFileInfoInput>;

export type FileInfoType = "file" | "directory" | "symlink" | "other";

export interface GetFileInfoOutput {
  path: string;
  type: FileInfoType;
  size: number;
  modifiedAt: string;
  createdAt: string;
  isSymlink: boolean;
  mime: string | null;
  lines?: number;
  linkTarget?: string;
  linkEscapesScope?: boolean;
}

/**
 * Returns metadata for a path inside the configured scope.
 *
 * Uses `lstat` (not `stat`) so we can faithfully report whether the path is
 * itself a symlink and inspect its target without following it. The target is
 * read via `readlink` and we annotate `linkEscapesScope` rather than throwing —
 * agents may legitimately ask "is this symlink dangerous?" and we should
 * answer.
 *
 * For text-looking files we stream the file once via readline to compute an
 * accurate line count. Binary / oversized files omit the field.
 */
export async function getFileInfoHandler(
  input: GetFileInfoInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<GetFileInfoOutput>> {
  const lexicalPath = assertWithinScope(config.scope, input.path);

  let stats;
  try {
    stats = await lstat(lexicalPath);
  } catch (error) {
    throw mapFsError(error, lexicalPath);
  }

  const isSymlink = stats.isSymbolicLink();
  const type: FileInfoType = isSymlink
    ? "symlink"
    : stats.isFile()
      ? "file"
      : stats.isDirectory()
        ? "directory"
        : "other";

  const out: GetFileInfoOutput = {
    path: input.path,
    type,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    createdAt: stats.birthtime.toISOString(),
    isSymlink,
    mime: type === "file" ? (mime.lookup(lexicalPath) || null) : null,
  };

  if (isSymlink) {
    try {
      const target = await readlink(lexicalPath);
      out.linkTarget = target;
      const absoluteTarget = path.isAbsolute(target)
        ? target
        : path.resolve(path.dirname(lexicalPath), target);
      const absoluteScope = path.resolve(config.scope);
      out.linkEscapesScope = !isWithinPath(absoluteScope, absoluteTarget);
    } catch {
      // best-effort: a broken symlink shouldn't kill the call
    }
  }

  if (type === "file" && shouldCountLines(lexicalPath, stats.size, out.mime)) {
    try {
      out.lines = await countLines(lexicalPath);
    } catch {
      // best-effort: skip line count on read failure
    }
  }

  return ok(out);
}

function shouldCountLines(absolutePath: string, size: number, mimeType: string | null): boolean {
  if (size > MAX_FILE_SIZE_FOR_LINE_COUNT) {
    return false;
  }
  if (mimeType !== null && mimeType.startsWith("text/")) {
    return true;
  }
  const ext = path.extname(absolutePath).toLowerCase();
  if (ext === "" && path.basename(absolutePath).startsWith(".")) {
    // dotfiles like `.env` — treat as text by convention
    return true;
  }
  return TEXT_EXTENSIONS.has(ext);
}

async function countLines(absolutePath: string): Promise<number> {
  const stream = createReadStream(absolutePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let count = 0;
  try {
    for await (const _line of rl) {
      count += 1;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return count;
}

function mapFsError(error: unknown, attemptedPath: string): FileSystemError {
  const errno = error as NodeJS.ErrnoException;
  return new FileSystemError(`Failed to stat path: ${errno.message ?? "unknown error"}`, {
    path: attemptedPath,
    code: errno.code ?? "UNKNOWN",
  });
}
