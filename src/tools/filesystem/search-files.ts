import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const SearchFilesInput = z.object({
  pattern: z.string().min(1),
  path: z.string().default("."),
  glob: z.string().optional(),
  caseInsensitive: z.boolean().default(false),
  contextLines: z.number().int().min(0).max(20).default(2),
  maxResults: z.number().int().positive().max(1000).default(200),
});

export type SearchFilesInput = z.infer<typeof SearchFilesInput>;

export interface SearchMatch {
  file: string;
  line: number;
  match: string;
  before: string[];
  after: string[];
}

export interface SearchFilesOutput {
  matches: SearchMatch[];
  truncated: boolean;
}

export async function searchFilesHandler(
  _input: SearchFilesInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<SearchFilesOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "search_files is not implemented yet"));
}
