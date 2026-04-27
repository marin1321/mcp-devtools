import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const ParseOpenApiInput = z.object({
  path: z.string().min(1),
});

export type ParseOpenApiInput = z.infer<typeof ParseOpenApiInput>;

export interface OperationSummary {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  tags?: string[];
}

export interface ParseOpenApiOutput {
  title: string;
  version: string;
  servers: string[];
  operations: OperationSummary[];
}

export async function parseOpenApiHandler(
  _input: ParseOpenApiInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<ParseOpenApiOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "parse_openapi is not implemented yet"));
}
