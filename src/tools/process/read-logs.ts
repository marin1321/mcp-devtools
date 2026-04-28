import { open, readFile, stat } from "node:fs/promises";

import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError, ValidationError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";
import { BINARY_DETECT_BYTES } from "../filesystem/_constants.js";
import { resolveWithinScope } from "../filesystem/_utils.js";

export const ReadLogsInput = z.object({
  path: z.string().min(1),
  tail: z.number().int().positive().max(10_000).default(200),
  filter: z.string().optional(),
  jsonField: z.string().optional(),
});

export type ReadLogsInput = z.infer<typeof ReadLogsInput>;

export interface ReadLogsOutput {
  path: string;
  lines: string[];
  truncated: boolean;
}

export async function readLogsHandler(
  input: ReadLogsInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<ReadLogsOutput>> {
  const resolvedPath = await resolveWithinScope(config.scope, input.path);

  let stats;
  try {
    stats = await stat(resolvedPath);
  } catch (error) {
    throw mapFsError(error, resolvedPath);
  }

  if (!stats.isFile()) {
    throw new FileSystemError("Path is not a regular file", { path: input.path });
  }

  await assertNotBinary(resolvedPath);

  const raw = await readFile(resolvedPath, "utf-8");
  if (raw.length === 0) {
    return ok({ path: input.path, lines: [], truncated: false });
  }

  const allLines = raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n");
  const truncated = allLines.length > input.tail;
  let lines = truncated ? allLines.slice(-input.tail) : allLines;

  if (input.filter !== undefined) {
    const re = buildFilter(input.filter);
    lines = lines.filter((l) => re.test(l));
  }

  if (input.jsonField !== undefined) {
    const segments = input.jsonField.split(".");
    lines = lines.reduce<string[]>((acc, line) => {
      try {
        const obj: unknown = JSON.parse(line);
        const val = extractField(obj, segments);
        if (val !== undefined) {
          acc.push(stringify(val));
        }
      } catch {
        /* skip unparseable lines */
      }
      return acc;
    }, []);
  }

  return ok({ path: input.path, lines, truncated });
}

function buildFilter(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(escapeRegExp(pattern), "i");
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringify(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return `${val}`;
  return JSON.stringify(val);
}

function extractField(obj: unknown, segments: string[]): unknown {
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

async function assertNotBinary(realPath: string): Promise<void> {
  const fh = await open(realPath, "r");
  try {
    const head = Buffer.alloc(BINARY_DETECT_BYTES);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    for (let i = 0; i < bytesRead; i += 1) {
      if (head[i] === 0) {
        throw new ValidationError("Binary files are not supported", { path: realPath });
      }
    }
  } finally {
    await fh.close();
  }
}

function mapFsError(error: unknown, attemptedPath: string): FileSystemError {
  const errno = error as NodeJS.ErrnoException;
  return new FileSystemError(`Failed to read file: ${errno.message ?? "unknown error"}`, {
    path: attemptedPath,
    code: errno.code ?? "UNKNOWN",
  });
}
