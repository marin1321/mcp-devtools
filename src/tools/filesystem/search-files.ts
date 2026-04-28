import { createReadStream } from "node:fs";
import { open, opendir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import picomatch from "picomatch";
import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError, ValidationError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { BINARY_DETECT_BYTES, DEFAULT_IGNORE_DIRS, MAX_LINE_LENGTH } from "./_constants.js";
import { pathIsHidden, resolveWithinScope } from "./_utils.js";

const MAX_FILE_SIZE_FOR_SEARCH = 10 * 1024 * 1024;

export const SearchFilesInput = z.object({
  pattern: z.string().min(1),
  path: z.string().default("."),
  glob: z.string().optional(),
  regex: z.boolean().default(false).describe("Treat `pattern` as a regular expression"),
  caseInsensitive: z.boolean().default(false),
  contextLines: z.number().int().min(0).max(20).default(2),
  maxResults: z.number().int().positive().max(1000).default(100),
  includeHidden: z.boolean().default(false),
});

export type SearchFilesInput = z.infer<typeof SearchFilesInput>;

export interface SearchMatch {
  /** Path relative to the search root, with forward slashes. */
  file: string;
  line: number;
  match: string;
  before: string[];
  after: string[];
}

export interface SearchFilesOutput {
  matches: SearchMatch[];
  truncated: boolean;
  filesScanned: number;
}

interface WalkState {
  matches: SearchMatch[];
  filesScanned: number;
  truncated: boolean;
  visited: Set<string>;
}

export async function searchFilesHandler(
  input: SearchFilesInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<SearchFilesOutput>> {
  const realRoot = await resolveWithinScope(config.scope, input.path);
  const stats = await stat(realRoot);
  if (!stats.isDirectory()) {
    throw new FileSystemError("Search path is not a directory", {
      path: input.path,
      code: "ENOTDIR",
    });
  }

  const matcher = compilePattern(input);
  const globMatcher =
    input.glob !== undefined && input.glob.length > 0
      ? picomatch(input.glob, { dot: input.includeHidden })
      : null;

  const state: WalkState = {
    matches: [],
    filesScanned: 0,
    truncated: false,
    visited: new Set([realRoot]),
  };

  await walk(realRoot, "", input, state, matcher, globMatcher);

  return ok({
    matches: state.matches,
    truncated: state.truncated,
    filesScanned: state.filesScanned,
  });
}

function compilePattern(input: SearchFilesInput): RegExp {
  const flags = input.caseInsensitive ? "i" : "";
  if (input.regex) {
    try {
      return new RegExp(input.pattern, flags);
    } catch (error) {
      throw new ValidationError(`Invalid regex: ${(error as Error).message}`, {
        pattern: input.pattern,
      });
    }
  }
  const escaped = input.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, flags);
}

async function walk(
  absoluteDir: string,
  relativeDir: string,
  input: SearchFilesInput,
  state: WalkState,
  matcher: RegExp,
  globMatcher: ReturnType<typeof picomatch> | null,
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
      if (state.truncated) {
        return;
      }
      const name = entry.name;
      if (!input.includeHidden && pathIsHidden(name)) {
        continue;
      }

      const relPath = relativeDir === "" ? name : `${relativeDir}/${name}`;
      const absPath = path.join(absoluteDir, name);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(name)) {
          continue;
        }
        let realChild: string;
        try {
          realChild = await realpath(absPath);
        } catch {
          continue;
        }
        if (state.visited.has(realChild)) {
          continue;
        }
        state.visited.add(realChild);
        await walk(realChild, relPath, input, state, matcher, globMatcher);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (globMatcher !== null && !globMatcher(relPath)) {
        continue;
      }

      await scanFile(absPath, relPath, input, state, matcher);
    }
  } finally {
    await dir.close().catch(() => undefined);
  }
}

async function scanFile(
  absolutePath: string,
  relativePath: string,
  input: SearchFilesInput,
  state: WalkState,
  matcher: RegExp,
): Promise<void> {
  let stats;
  try {
    stats = await stat(absolutePath);
  } catch {
    return;
  }
  if (stats.size > MAX_FILE_SIZE_FOR_SEARCH) {
    return;
  }

  if (await isBinary(absolutePath)) {
    return;
  }

  state.filesScanned += 1;

  const buffer: string[] = [];
  const stream = createReadStream(absolutePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  let lineNo = 0;
  const pendingAfter: { match: SearchMatch; remaining: number }[] = [];

  try {
    for await (const rawLine of rl) {
      lineNo += 1;
      const line =
        rawLine.length > MAX_LINE_LENGTH ? `${rawLine.slice(0, MAX_LINE_LENGTH)}…` : rawLine;

      for (const pending of pendingAfter) {
        pending.match.after.push(line);
        pending.remaining -= 1;
      }
      while (pendingAfter.length > 0 && pendingAfter[0]!.remaining <= 0) {
        pendingAfter.shift();
      }

      if (matcher.test(line)) {
        const before = buffer.slice(-input.contextLines);
        const match: SearchMatch = {
          file: relativePath,
          line: lineNo,
          match: line,
          before,
          after: [],
        };
        state.matches.push(match);
        if (input.contextLines > 0) {
          pendingAfter.push({ match, remaining: input.contextLines });
        }

        if (state.matches.length >= input.maxResults) {
          state.truncated = true;
          return;
        }
      }

      buffer.push(line);
      if (buffer.length > input.contextLines) {
        buffer.shift();
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

async function isBinary(absolutePath: string): Promise<boolean> {
  const fh = await open(absolutePath, "r");
  try {
    const head = Buffer.alloc(BINARY_DETECT_BYTES);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    for (let i = 0; i < bytesRead; i += 1) {
      if (head[i] === 0) {
        return true;
      }
    }
    return false;
  } finally {
    await fh.close();
  }
}

function mapFsError(error: unknown, attemptedPath: string): FileSystemError {
  const errno = error as NodeJS.ErrnoException;
  return new FileSystemError(`Failed to walk directory: ${errno.message ?? "unknown error"}`, {
    path: attemptedPath,
    code: errno.code ?? "UNKNOWN",
  });
}
