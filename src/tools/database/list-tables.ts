import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { ConfigError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { getPool } from "./_pool.js";

export const ListTablesInput = z.object({
  connection: z.string().default("default"),
  schema: z.string().optional(),
});

export type ListTablesInput = z.infer<typeof ListTablesInput>;

export interface ListTablesEntry {
  name: string;
  schema: string | null;
  type: "table" | "view";
}

export interface ListTablesOutput {
  tables: ListTablesEntry[];
  count: number;
}

/**
 * Lists user tables (and views) for a configured database connection.
 *
 * The output is sorted deterministically by `(schema, name)` so agents can
 * diff successive calls cheaply. System schemas are excluded by the
 * adapters themselves.
 */
export async function listTablesHandler(
  input: ListTablesInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<ListTablesOutput>> {
  if (config.databases[input.connection] === undefined) {
    throw new ConfigError(`Database connection '${input.connection}' is not configured`, {
      available: Object.keys(config.databases),
    });
  }

  const pool = getPool(config);
  const adapter = await pool.get(input.connection);
  const raw = await adapter.listTables(input.schema);

  const tables: ListTablesEntry[] = raw
    .map((t) => ({ name: t.name, schema: t.schema, type: t.type }))
    .sort((a, b) => {
      const sa = a.schema ?? "";
      const sb = b.schema ?? "";
      if (sa !== sb) {
        return sa < sb ? -1 : 1;
      }
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });

  return ok({ tables, count: tables.length });
}
