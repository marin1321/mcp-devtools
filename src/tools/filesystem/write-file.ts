import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const WriteFileInput = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(["utf8", "utf-8", "ascii", "base64", "hex"]).default("utf8").optional(),
  createDirs: z.boolean().default(false).optional(),
});

export type WriteFileInput = z.infer<typeof WriteFileInput>;

export interface WriteFileOutput {
  path: string;
  bytesWritten: number;
}

export async function writeFileHandler(
  _input: WriteFileInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<WriteFileOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "write_file is not implemented yet"));
}
