import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err } from "../../types/tool-result.js";

export const DescribeTableInput = z.object({
  connection: z.string().default("default"),
  table: z.string().min(1),
  schema: z.string().optional(),
});

export type DescribeTableInput = z.infer<typeof DescribeTableInput>;

export interface DescribeTableOutput {
  table: string;
  columns: {
    name: string;
    dataType: string;
    nullable: boolean;
    defaultValue: string | null;
    isPrimaryKey: boolean;
  }[];
}

export async function describeTableHandler(
  _input: DescribeTableInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<DescribeTableOutput>> {
  return Promise.resolve(err("NOT_IMPLEMENTED", "describe_table is not implemented yet"));
}
