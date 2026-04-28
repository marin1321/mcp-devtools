import type { DatabaseConfig } from "../../../types/config.js";
import { ConfigError, DatabaseError } from "../../../types/errors.js";
import {
  type ColumnInfo,
  type DatabaseAdapter,
  type QueryResult,
  type TableInfo,
  resolveConnectionString,
} from "../connection-pool.js";

interface BetterSqlite3Module {
  default: BetterSqlite3Constructor;
}

type BetterSqlite3Constructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => BetterSqlite3Database;

interface BetterSqlite3Database {
  prepare(sql: string): BetterSqlite3Statement;
  pragma(pragma: string, options?: { simple?: boolean }): unknown;
  exec(sql: string): unknown;
  close(): void;
  readonly readonly: boolean;
}

interface BetterSqlite3Statement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number };
  columns(): { name: string; type?: string | null }[];
  raw(toggle?: boolean): BetterSqlite3Statement;
  reader: boolean;
}

/**
 * Loads `better-sqlite3` lazily so consumers without SQLite databases don't
 * pay the install cost. A missing module surfaces as a {@link ConfigError}
 * with an actionable hint.
 */
async function loadBetterSqlite3(): Promise<BetterSqlite3Constructor> {
  try {
    const mod = (await import("better-sqlite3")) as unknown as BetterSqlite3Module;
    return mod.default;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ERR_MODULE_NOT_FOUND" || errno.code === "MODULE_NOT_FOUND") {
      throw new ConfigError(
        "SQLite adapter requires the 'better-sqlite3' peer dependency. Run: npm install better-sqlite3",
      );
    }
    throw new DatabaseError(`Failed to load 'better-sqlite3': ${(error as Error).message}`);
  }
}

export async function createSqliteAdapter(config: DatabaseConfig): Promise<DatabaseAdapter> {
  if (config.type !== "sqlite") {
    throw new ConfigError(`Expected sqlite config, got '${config.type}'`);
  }
  const Ctor = await loadBetterSqlite3();
  const file = resolveConnectionString(config.connectionString);

  let db: BetterSqlite3Database;
  try {
    db = new Ctor(file, { readonly: config.readOnly });
  } catch (error) {
    throw new DatabaseError(`Failed to open SQLite database: ${(error as Error).message}`, {
      file,
    });
  }

  const adapter: DatabaseAdapter = {
    engine: "sqlite",
    readOnly: config.readOnly,

    query(sql: string, params: unknown[] = []): Promise<QueryResult> {
      try {
        const stmt = db.prepare(sql);
        if (stmt.reader) {
          const cols = stmt.columns().map((c) => ({
            name: c.name,
            type: typeof c.type === "string" && c.type !== "" ? c.type : "unknown",
          }));
          const rows = stmt.all(...params) as Record<string, unknown>[];
          return Promise.resolve({ rows, columns: cols, rowCount: rows.length });
        }
        const info = stmt.run(...params);
        return Promise.resolve({ rows: [], columns: [], rowCount: info.changes });
      } catch (error) {
        return Promise.reject(mapError(error));
      }
    },

    listTables(): Promise<TableInfo[]> {
      try {
        const rows = db
          .prepare(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as { name: string; type: string }[];
        return Promise.resolve(
          rows.map((r) => ({
            schema: null,
            name: r.name,
            type: r.type === "view" ? "view" : "table",
          })),
        );
      } catch (error) {
        return Promise.reject(mapError(error));
      }
    },

    describeTable(table: string): Promise<ColumnInfo[]> {
      try {
        const rows = db.pragma(`table_info(${quoteIdent(table)})`, {
          simple: false,
        }) as { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[];
        return Promise.resolve(
          rows.map((r) => ({
            name: r.name,
            dataType: r.type ?? "",
            nullable: r.notnull === 0,
            defaultValue: stringifyDefault(r.dflt_value),
            isPrimaryKey: r.pk > 0,
          })),
        );
      } catch (error) {
        return Promise.reject(mapError(error));
      }
    },

    close(): Promise<void> {
      try {
        db.close();
      } catch {
        // best-effort
      }
      return Promise.resolve();
    },
  };

  return adapter;
}

function stringifyDefault(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value);
}

function quoteIdent(ident: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    throw new DatabaseError(`Invalid SQLite identifier: ${ident}`);
  }
  return `"${ident}"`;
}

function mapError(error: unknown): DatabaseError {
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(message);
}
