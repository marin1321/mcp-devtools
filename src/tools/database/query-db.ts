import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import {
  ConfigError,
  DatabaseError,
  ReadOnlyViolationError,
  TimeoutError,
} from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { __resetPoolCacheForTests, __setPoolFactoryForTests, getPool } from "./_pool.js";
import { isReadOnlySql } from "./_sql-guard.js";
import type { DatabaseAdapter } from "./connection-pool.js";

export { __resetPoolCacheForTests, __setPoolFactoryForTests };

export const QueryDbInput = z.object({
  connection: z.string().default("default"),
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  maxRows: z.number().int().positive().max(10_000).optional(),
});

export type QueryDbInput = z.infer<typeof QueryDbInput>;

export interface QueryDbOutput {
  rows: Record<string, unknown>[];
  columns: { name: string; type: string }[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

/**
 * `query_db` is the per-call surface for database access.
 *
 * Pipeline (security boundary documented at each step):
 *
 *   1. Look up the configured connection (`ConfigError` on miss).
 *   2. Resolve the adapter via the lazy connection pool.
 *   3. If the adapter is read-only, run the SQL through the parser guard
 *      (`isReadOnlySql`). The guard is **belt** to the adapter's
 *      engine-level **suspenders** (`BEGIN READ ONLY` / `readonly: true`).
 *   4. Execute the query under a `Promise.race` against a configurable
 *      timeout. Timed-out queries surface `TimeoutError` and the adapter is
 *      left to GC its in-flight work; future tasks may add per-engine cancel.
 *   5. Cap rows at `maxRows` (default from config) and serialize values to
 *      JSON-safe shapes so the MCP transport can transmit them verbatim.
 *
 * Per-call pool: the global pool lives on the server. The handler accesses
 * it via the injected `config` (a transitional approach until task 13 wires
 * the pool through directly).
 */
export async function queryDbHandler(
  input: QueryDbInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<QueryDbOutput>> {
  const dbConfig = config.databases[input.connection];
  if (dbConfig === undefined) {
    throw new ConfigError(`Database connection '${input.connection}' is not configured`, {
      available: Object.keys(config.databases),
    });
  }

  const pool = getPool(config);
  const adapter = await pool.get(input.connection);

  if (adapter.readOnly) {
    const guard = isReadOnlySql(input.sql);
    if (!guard.ok) {
      throw new ReadOnlyViolationError(
        `SQL guard rejected statement: ${guard.reason ?? "unknown"}`,
        {
          sql: input.sql.slice(0, 200),
        },
      );
    }
  }

  const timeoutMs = input.timeoutMs ?? dbConfig.queryTimeoutMs;
  const maxRows = input.maxRows ?? dbConfig.maxRows;

  const start = performance.now();
  let result;
  try {
    result = await raceWithTimeout(adapter.query(input.sql, input.params), timeoutMs);
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw error;
    }
    if (error instanceof DatabaseError) {
      throw error;
    }
    throw new DatabaseError(error instanceof Error ? error.message : String(error), {
      sql: input.sql.slice(0, 200),
    });
  }
  const durationMs = Math.round(performance.now() - start);

  const truncated = result.rows.length > maxRows;
  const rows = (truncated ? result.rows.slice(0, maxRows) : result.rows).map(makeJsonSafeRow);

  return ok({
    rows,
    columns: result.columns,
    rowCount: rows.length,
    truncated,
    durationMs,
  });
}

/**
 * Module-scoped pool cache keyed by the config's `databases` reference.
 *
 * `query_db` is invoked per-call, but spinning up a fresh pool every time
 * would defeat connection reuse. Until the server explicitly threads its
 * pool through to handlers (task 13), we cache one pool per loaded config.
 */
async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(`Query exceeded timeout of ${ms}ms`, { timeoutMs: ms }));
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function makeJsonSafeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = makeJsonSafeValue(value);
  }
  return out;
}

function makeJsonSafeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return { __type: "bigint", value: value.toString() };
  }
  if (Buffer.isBuffer(value)) {
    return { __type: "buffer", base64: value.toString("base64") };
  }
  if (value instanceof Uint8Array) {
    return { __type: "buffer", base64: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map(makeJsonSafeValue);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = makeJsonSafeValue(v);
    }
    return out;
  }
  return value;
}

// Re-export the adapter type so consumers can mock without importing the
// connection-pool module directly in test code.
export type { DatabaseAdapter };
