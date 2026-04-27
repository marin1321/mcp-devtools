import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const RunCommandInput = z.object({
  command: z.string().min(1).describe("Binary name (must be in allowedCommands)"),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
});

export type RunCommandInput = z.infer<typeof RunCommandInput>;

export interface RunCommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

export async function runCommandHandler(
  _input: RunCommandInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<RunCommandOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "run_command is not implemented yet"));
}
