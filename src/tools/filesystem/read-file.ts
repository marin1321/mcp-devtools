import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import readline from "node:readline";

import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError, ValidationError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { BINARY_DETECT_BYTES, MAX_FILE_BYTES } from "./_constants.js";
import { resolveWithinScope } from "./_utils.js";

export const ReadFileInput = z.object({
  path: z.string().min(1).describe("Relative path from the configured scope root"),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based, inclusive. Returns from this line onwards."),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based, inclusive. Returns up to and including this line."),
});

export type ReadFileInput = z.infer<typeof ReadFileInput>;

export type ReadFileEncoding = "utf-8" | "utf-8-bom";

export interface ReadFileOutput {
  path: string;
  content: string;
  lineCount: number;
  encoding: ReadFileEncoding;
  truncated: boolean;
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export async function readFileHandler(
  input: ReadFileInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<ReadFileOutput>> {
  if (
    input.startLine !== undefined &&
    input.endLine !== undefined &&
    input.startLine > input.endLine
  ) {
    throw new ValidationError("startLine must be <= endLine", {
      startLine: input.startLine,
      endLine: input.endLine,
    });
  }

  let resolvedPath: string;
  try {
    resolvedPath = await resolveWithinScope(config.scope, input.path);
  } catch (error) {
    if (error instanceof FileSystemError || error instanceof ValidationError) {
      throw error;
    }
    throw error;
  }

  let stats;
  try {
    stats = await stat(resolvedPath);
  } catch (error) {
    throw mapFsError(error, resolvedPath);
  }

  if (stats.isDirectory()) {
    throw new FileSystemError("Path is a directory, not a file", {
      path: input.path,
      code: "EISDIR",
    });
  }
  if (!stats.isFile()) {
    throw new FileSystemError("Path is not a regular file", {
      path: input.path,
    });
  }

  await assertNotBinary(resolvedPath);

  const wantsRange = input.startLine !== undefined || input.endLine !== undefined;
  if (wantsRange) {
    return readRange(input, resolvedPath);
  }
  return readWhole(input, resolvedPath, stats.size);
}

async function assertNotBinary(realPath: string): Promise<void> {
  const fh = await open(realPath, "r");
  try {
    const head = Buffer.alloc(BINARY_DETECT_BYTES);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    if (containsNullByte(head.subarray(0, bytesRead))) {
      throw new FileSystemError("Binary file detected — read_file accepts text only", {
        path: realPath,
      });
    }
  } finally {
    await fh.close();
  }
}

function containsNullByte(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

async function readWhole(
  input: ReadFileInput,
  realPath: string,
  size: number,
): Promise<ToolResult<ReadFileOutput>> {
  const truncated = size > MAX_FILE_BYTES;
  const toRead = Math.min(size, MAX_FILE_BYTES);
  const buf = Buffer.alloc(toRead);
  const fh = await open(realPath, "r");
  try {
    if (toRead > 0) {
      await fh.read(buf, 0, toRead, 0);
    }
  } finally {
    await fh.close();
  }
  const { content, encoding } = decodeUtf8(buf);
  return ok({
    path: input.path,
    content,
    lineCount: countLines(content),
    encoding,
    truncated,
  });
}

async function readRange(
  input: ReadFileInput,
  realPath: string,
): Promise<ToolResult<ReadFileOutput>> {
  const startLine = input.startLine ?? 1;
  const endLine = input.endLine ?? Number.POSITIVE_INFINITY;

  const stream = createReadStream(realPath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  const collected: string[] = [];
  let totalLines = 0;
  let encoding: ReadFileEncoding = "utf-8";
  try {
    let lineNo = 0;
    for await (const rawLine of rl) {
      lineNo += 1;
      let line = rawLine;
      if (lineNo === 1 && line.charCodeAt(0) === 0xfeff) {
        line = line.slice(1);
        encoding = "utf-8-bom";
      }
      if (lineNo >= startLine && lineNo <= endLine) {
        collected.push(line);
      }
      totalLines = lineNo;
      if (lineNo > endLine) {
        break;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (totalLines > 0 && startLine > totalLines) {
    throw new FileSystemError("Range out of bounds", {
      path: input.path,
      startLine,
      totalLines,
    });
  }

  return ok({
    path: input.path,
    content: collected.join("\n"),
    lineCount: collected.length,
    encoding,
    truncated: false,
  });
}

function decodeUtf8(buf: Buffer): { content: string; encoding: ReadFileEncoding } {
  if (
    buf.length >= 3 &&
    buf[0] === UTF8_BOM[0] &&
    buf[1] === UTF8_BOM[1] &&
    buf[2] === UTF8_BOM[2]
  ) {
    return { content: buf.subarray(3).toString("utf-8"), encoding: "utf-8-bom" };
  }
  return { content: buf.toString("utf-8"), encoding: "utf-8" };
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  let count = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 0x0a) {
      count += 1;
    }
  }
  if (content.charCodeAt(content.length - 1) === 0x0a) {
    count -= 1;
  }
  return count;
}

function mapFsError(error: unknown, attemptedPath: string): FileSystemError {
  const errno = error as NodeJS.ErrnoException;
  return new FileSystemError(`Failed to read file: ${errno.message ?? "unknown error"}`, {
    path: attemptedPath,
    code: errno.code ?? "UNKNOWN",
  });
}
