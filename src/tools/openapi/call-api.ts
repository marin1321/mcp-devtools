import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const CallApiInput = z.object({
  specPath: z.string().min(1),
  operationId: z.string().min(1),
  pathParams: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).default({}),
});

export type CallApiInput = z.infer<typeof CallApiInput>;

export interface CallApiOutput {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

export async function callApiHandler(
  _input: CallApiInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<CallApiOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "call_api is not implemented yet"));
}
