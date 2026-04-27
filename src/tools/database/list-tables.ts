import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const ListTablesInput = z.object({
  connection: z.string().default("default"),
  schema: z.string().optional(),
});

export type ListTablesInput = z.infer<typeof ListTablesInput>;

export interface ListTablesOutput {
  tables: {
    schema: string | null;
    name: string;
    rowCountEstimate: number | null;
    type: "table" | "view";
  }[];
}

export async function listTablesHandler(
  _input: ListTablesInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<ListTablesOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "list_tables is not implemented yet"));
}
