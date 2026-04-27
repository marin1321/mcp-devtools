import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

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

export async function getEnvHandler(
  _input: GetEnvInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<GetEnvOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "get_env is not implemented yet"));
}
