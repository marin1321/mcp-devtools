import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const GetFileInfoInput = z.object({
  path: z.string().min(1),
});

export type GetFileInfoInput = z.infer<typeof GetFileInfoInput>;

export interface GetFileInfoOutput {
  path: string;
  size: number;
  lines?: number;
  encoding?: string;
  mimeType?: string;
  modifiedAt: string;
  createdAt: string;
  isSymlink: boolean;
}

export async function getFileInfoHandler(
  _input: GetFileInfoInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<GetFileInfoOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "get_file_info is not implemented yet"));
}
