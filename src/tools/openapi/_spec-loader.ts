import { readFile } from "node:fs/promises";
import path from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI } from "openapi-types";
import { parse as parseYaml } from "yaml";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError, ValidationError } from "../../types/errors.js";
import { resolveWithinScope } from "../filesystem/_utils.js";

/**
 * Resolves, reads, and dereferences an OpenAPI/Swagger spec file.
 *
 * Shared by `parse_openapi` and `call_api` so scope validation and parsing
 * logic lives in one place.
 */
export async function loadSpec(
  specPath: string,
  config: McpDevtoolsConfig,
): Promise<OpenAPI.Document> {
  const resolvedPath = await resolveWithinScope(config.scope, specPath);

  let raw: string;
  try {
    raw = await readFile(resolvedPath, "utf-8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      throw new FileSystemError(`Spec file not found: ${specPath}`, {
        path: resolvedPath,
        code: "ENOENT",
      });
    }
    throw new FileSystemError(`Failed to read spec file: ${errno.message ?? "unknown error"}`, {
      path: resolvedPath,
      code: errno.code ?? "UNKNOWN",
    });
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  let parsed: unknown;
  try {
    if (ext === ".json") {
      parsed = JSON.parse(raw);
    } else if (ext === ".yaml" || ext === ".yml") {
      parsed = parseYaml(raw);
    } else {
      throw new ValidationError(`Unsupported spec file extension: ${ext}`, {
        path: specPath,
        extension: ext,
      });
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`Failed to parse spec file: ${(error as Error).message}`, {
      path: specPath,
    });
  }

  try {
    return await SwaggerParser.dereference(parsed as OpenAPI.Document);
  } catch (error) {
    throw new ValidationError(`Invalid OpenAPI/Swagger spec: ${(error as Error).message}`, {
      path: specPath,
    });
  }
}
