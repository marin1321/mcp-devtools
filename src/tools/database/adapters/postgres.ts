import type { DatabaseConfig } from "../../../types/config.js";
import { ConfigError, DatabaseError } from "../../../types/errors.js";
import {
  type ColumnInfo,
  type DatabaseAdapter,
  type QueryResult,
  type TableInfo,
  resolveConnectionString,
} from "../connection-pool.js";

interface PgClient {
  query(textOrConfig: string | { text: string; values?: unknown[] }, values?: unknown[]): Promise<PgResult>;
  release(): void;
}

interface PgPool {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

interface PgResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
  fields?: { name: string; dataTypeID: number }[];
}

interface PgModule {
  Pool: new (options: { connectionString: string; max?: number }) => PgPool;
  types?: { getTypeParser?: (oid: number) => unknown };
}

/**
 * Test seam: lets unit tests inject a fake `pg` module without actually
 * loading the driver. Set to `null` to restore the real loader.
 */
let pgLoaderOverride: (() => Promise<PgModule>) | null = null;

export function __setPgLoaderForTests(loader: (() => Promise<PgModule>) | null): void {
  pgLoaderOverride = loader;
}

async function loadPg(): Promise<PgModule> {
  try {
    if (pgLoaderOverride !== null) {
      return await pgLoaderOverride();
    }
    const mod = (await import("pg")) as unknown as { default?: PgModule } & PgModule;
    return mod.default ?? mod;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ERR_MODULE_NOT_FOUND" || errno.code === "MODULE_NOT_FOUND") {
      throw new ConfigError(
        "PostgreSQL adapter requires the 'pg' peer dependency. Run: npm install pg",
      );
    }
    throw new DatabaseError(`Failed to load 'pg': ${(error as Error).message}`);
  }
}

export async function createPostgresAdapter(config: DatabaseConfig): Promise<DatabaseAdapter> {
  if (config.type !== "postgresql") {
    throw new ConfigError(`Expected postgresql config, got '${config.type}'`);
  }
  const pg = await loadPg();
  const pool = new pg.Pool({
    connectionString: resolveConnectionString(config.connectionString),
    max: 1,
  });

  async function withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
    let client: PgClient;
    try {
      client = await pool.connect();
    } catch (error) {
      throw mapPgError(error);
    }
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  const adapter: DatabaseAdapter = {
    engine: "postgresql",
    readOnly: config.readOnly,

    async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
      return withClient(async (client) => {
        try {
          if (config.readOnly) {
            await client.query("BEGIN READ ONLY");
          }
          const result = await client.query({ text: sql, values: params });
          if (config.readOnly) {
            await client.query("COMMIT");
          }
          const columns = (result.fields ?? []).map((f) => ({
            name: f.name,
            type: pgTypeName(f.dataTypeID),
          }));
          return {
            rows: result.rows ?? [],
            columns,
            rowCount: result.rowCount ?? (result.rows?.length ?? 0),
          };
        } catch (error) {
          if (config.readOnly) {
            try {
              await client.query("ROLLBACK");
            } catch {
              // ignore rollback failure
            }
          }
          throw mapPgError(error);
        }
      });
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      const sql = schema
        ? `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_schema, table_name`
        : `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name`;
      const params = schema ? [schema] : [];
      const result = await this.query(sql, params);
      return result.rows.map((r) => ({
        schema: (r.table_schema as string | null) ?? null,
        name: r.table_name as string,
        type: r.table_type === "VIEW" ? "view" : "table",
      }));
    },

    async describeTable(table: string, schema = "public"): Promise<ColumnInfo[]> {
      const result = await this.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = $2
         ORDER BY ordinal_position`,
        [table, schema],
      );
      const pkResult = await this.query(
        `SELECT a.attname AS column_name
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = ($1 || '.' || $2)::regclass AND i.indisprimary`,
        [schema, table],
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const pkSet = new Set(pkResult.rows.map((r) => r.column_name as string));
      return result.rows.map((r) => ({
        name: r.column_name as string,
        dataType: r.data_type as string,
        nullable: (r.is_nullable as string) === "YES",
        defaultValue: (r.column_default as string | null) ?? null,
        isPrimaryKey: pkSet.has(r.column_name as string),
      }));
    },

    async close(): Promise<void> {
      try {
        await pool.end();
      } catch {
        // best-effort
      }
    },
  };

  return adapter;
}

function pgTypeName(oid: number): string {
  // Minimal subset; richer mapping can be added later. Anything unknown falls
  // back to the OID string so callers can still distinguish columns.
  switch (oid) {
    case 16:
      return "boolean";
    case 20:
    case 21:
    case 23:
      return "integer";
    case 25:
    case 1042:
    case 1043:
      return "text";
    case 700:
    case 701:
    case 1700:
      return "numeric";
    case 1082:
      return "date";
    case 1114:
    case 1184:
      return "timestamp";
    case 114:
    case 3802:
      return "json";
    case 2950:
      return "uuid";
    default:
      return `oid:${oid}`;
  }
}

function mapPgError(error: unknown): DatabaseError {
  const errAny = error as { message?: string; code?: string };
  return new DatabaseError(errAny.message ?? "Unknown PostgreSQL error", {
    pgCode: errAny.code,
  });
}
