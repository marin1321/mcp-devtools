import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { ConfigError, DatabaseError, ValidationError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { getPool } from "./_pool.js";

export const DescribeTableInput = z.object({
  connection: z.string().default("default"),
  table: z.string().min(1),
  schema: z.string().optional(),
});

export type DescribeTableInput = z.infer<typeof DescribeTableInput>;

export interface DescribeTableColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface DescribeTableOutput {
  table: string;
  schema: string | null;
  columns: DescribeTableColumn[];
}

/**
 * Returns column metadata for a single table.
 *
 * The adapter abstraction guarantees a uniform shape (`{ name, dataType,
 * nullable, defaultValue, isPrimaryKey }`) across Postgres, MySQL, and
 * SQLite. An empty column list is treated as "table not found" — every
 * supported engine surfaces missing tables that way.
 */
export async function describeTableHandler(
  input: DescribeTableInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<DescribeTableOutput>> {
  if (input.table.trim().length === 0) {
    throw new ValidationError("table must be a non-empty string");
  }
  if (config.databases[input.connection] === undefined) {
    throw new ConfigError(`Database connection '${input.connection}' is not configured`, {
      available: Object.keys(config.databases),
    });
  }

  const pool = getPool(config);
  const adapter = await pool.get(input.connection);
  const columns = await adapter.describeTable(input.table, input.schema);

  if (columns.length === 0) {
    const where = input.schema !== undefined ? `${input.schema}.${input.table}` : input.table;
    throw new DatabaseError(`Table not found: ${where}`, {
      table: input.table,
      schema: input.schema ?? null,
    });
  }

  return ok({
    table: input.table,
    schema: input.schema ?? null,
    columns,
  });
}
