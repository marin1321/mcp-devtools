import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const QueryDbInput = z.object({
  connection: z.string().default("default"),
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
});

export type QueryDbInput = z.infer<typeof QueryDbInput>;

export interface QueryDbOutput {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export async function queryDbHandler(
  _input: QueryDbInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<QueryDbOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "query_db is not implemented yet"));
}
