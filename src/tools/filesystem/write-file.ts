import { randomBytes } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError, ValidationError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { assertWithinScope } from "./_utils.js";

export const WriteFileInput = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(["utf8", "utf-8", "ascii", "base64", "hex"]).default("utf-8"),
  createDirs: z.boolean().default(false),
});

export type WriteFileInput = z.infer<typeof WriteFileInput>;

export interface WriteFileOutput {
  path: string;
  bytesWritten: number;
  created: boolean;
}

/**
 * Atomic file write.
 *
 * Writes the payload to a sibling temp file, then `rename()`s it over the
 * target. `rename()` is atomic on the same filesystem, so a concurrent
 * reader either sees the previous content or the new content — never a
 * half-written file.
 *
 * If the input path is itself a symlink, the write follows the symlink to
 * its target (Node's default `writeFile`/`rename` behavior). The symlink
 * must still resolve inside the configured scope; this is enforced by the
 * `read_file`-style scope checks at higher layers — `write_file`'s sync
 * `assertWithinScope` only validates the lexical path.
 */
export async function writeFileHandler(
  input: WriteFileInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<WriteFileOutput>> {
  const target = assertWithinScope(config.scope, input.path);
  const parent = path.dirname(target);

  await ensureParent(parent, input.createDirs);
  await ensureTargetIsNotDirectory(target);

  const created = !(await pathExists(target));
  const payload = encodePayload(input.content, input.encoding);
  const tmpPath = `${target}.tmp.${process.pid}.${randomBytes(8).toString("hex")}`;

  try {
    await writeFile(tmpPath, payload);
    await rename(tmpPath, target);
  } catch (error) {
    await unlinkSafe(tmpPath);
    throw mapFsError(error, target);
  }

  return ok({
    path: input.path,
    bytesWritten: payload.length,
    created,
  });
}

async function ensureParent(parent: string, createDirs: boolean): Promise<void> {
  if (await pathExists(parent)) {
    return;
  }
  if (!createDirs) {
    throw new FileSystemError(
      "Parent directory does not exist (set createDirs=true to create it)",
      {
        parent,
        code: "ENOENT",
      },
    );
  }
  try {
    await mkdir(parent, { recursive: true });
  } catch (error) {
    throw mapFsError(error, parent);
  }
}

async function ensureTargetIsNotDirectory(target: string): Promise<void> {
  try {
    const stats = await stat(target);
    if (stats.isDirectory()) {
      throw new FileSystemError("Path is an existing directory; refusing to overwrite", {
        path: target,
        code: "EISDIR",
      });
    }
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      return;
    }
    throw mapFsError(error, target);
  }
}

function encodePayload(content: string, encoding: WriteFileInput["encoding"]): Buffer {
  switch (encoding) {
    case "utf8":
    case "utf-8":
      return Buffer.from(content, "utf-8");
    case "ascii":
      return Buffer.from(content, "ascii");
    case "base64":
      try {
        return Buffer.from(content, "base64");
      } catch {
        throw new ValidationError("Invalid base64 content");
      }
    case "hex":
      try {
        return Buffer.from(content, "hex");
      } catch {
        throw new ValidationError("Invalid hex content");
      }
    default: {
      const exhaustive: never = encoding;
      throw new ValidationError(`Unsupported encoding: ${String(exhaustive)}`);
    }
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function unlinkSafe(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch {
    // Best-effort cleanup; swallow ENOENT and any other failure.
  }
}

function mapFsError(error: unknown, attemptedPath: string): FileSystemError {
  if (error instanceof FileSystemError) {
    return error;
  }
  const errno = error as NodeJS.ErrnoException;
  return new FileSystemError(`Failed to write file: ${errno.message ?? "unknown error"}`, {
    path: attemptedPath,
    code: errno.code ?? "UNKNOWN",
  });
}
