import { readFile } from "node:fs/promises";

import * as dotenv from "dotenv";
import { z } from "zod";

import { resolveWithinScope } from "../../tools/filesystem/_utils.js";
import type { McpDevtoolsConfig } from "../../types/config.js";
import { FileSystemError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

export const GetEnvInput = z.object({
  source: z.enum(["env", "dotenv"]).default("dotenv"),
  path: z.string().default(".env"),
  keys: z.array(z.string()).optional(),
  maskSecrets: z.boolean().default(true),
});

export type GetEnvInput = z.infer<typeof GetEnvInput>;

export interface GetEnvOutput {
  variables: Record<string, string>;
}

const SECRET_PATTERN = /SECRET|PASSWORD|PASSWD|TOKEN|KEY|API_KEY|PRIVATE|CREDENTIAL|AUTH|APIKEY/i;

export async function getEnvHandler(
  input: GetEnvInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<GetEnvOutput>> {
  let variables: Record<string, string>;

  if (input.source === "dotenv") {
    const resolvedPath = await resolveWithinScope(config.scope, input.path);

    let content: string;
    try {
      content = await readFile(resolvedPath, "utf-8");
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === "ENOENT") {
        throw new FileSystemError(`File not found: ${input.path}`, {
          path: input.path,
          code: "ENOENT",
        });
      }
      throw new FileSystemError(`Failed to read file: ${errno.message ?? "unknown error"}`, {
        path: input.path,
        code: errno.code ?? "UNKNOWN",
      });
    }

    variables = dotenv.parse(content);
  } else {
    variables = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") {
        variables[key] = value;
      }
    }
  }

  if (input.keys) {
    const filtered: Record<string, string> = {};
    for (const key of input.keys) {
      const value = variables[key];
      if (value !== undefined) {
        filtered[key] = value;
      }
    }
    variables = filtered;
  }

  if (input.maskSecrets) {
    for (const key of Object.keys(variables)) {
      if (SECRET_PATTERN.test(key)) {
        variables[key] = "****";
      }
    }
  }

  return ok({ variables });
}
