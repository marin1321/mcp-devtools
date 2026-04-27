import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

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
  _input: ReadLogsInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<ReadLogsOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "read_logs is not implemented yet"));
}
