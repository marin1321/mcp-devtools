import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const ReadFileInput = z.object({
  path: z.string().min(1).describe("Relative path from project scope root"),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});

export type ReadFileInput = z.infer<typeof ReadFileInput>;

export interface ReadFileOutput {
  path: string;
  content: string;
  lineCount: number;
  encoding: BufferEncoding;
}

export async function readFileHandler(
  _input: ReadFileInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<ReadFileOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "read_file is not implemented yet"));
}
