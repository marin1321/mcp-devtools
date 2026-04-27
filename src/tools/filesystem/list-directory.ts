import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const ListDirectoryInput = z.object({
  path: z.string().min(1).default("."),
  depth: z.number().int().min(0).max(20).default(1),
  glob: z.string().optional(),
  includeHidden: z.boolean().default(false),
});

export type ListDirectoryInput = z.infer<typeof ListDirectoryInput>;

export interface DirectoryEntry {
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modifiedAt: string;
}

export interface ListDirectoryOutput {
  root: string;
  entries: DirectoryEntry[];
}

export async function listDirectoryHandler(
  _input: ListDirectoryInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<ListDirectoryOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "list_directory is not implemented yet"));
}
