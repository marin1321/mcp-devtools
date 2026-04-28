import type { DatabaseConfig } from "../../../types/config.js";
import { ConfigError, DatabaseError } from "../../../types/errors.js";
import {
  type ColumnInfo,
  type DatabaseAdapter,
  type QueryResult,
  type TableInfo,
  resolveConnectionString,
} from "../connection-pool.js";

interface MysqlConnection {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<[T, MysqlField[]]>;
  release(): void;
}

interface MysqlPool {
  getConnection(): Promise<MysqlConnection>;
  end(): Promise<void>;
}

interface MysqlField {
  name: string;
  type?: number;
  columnType?: number;
}

interface MysqlPromiseModule {
  createPool(options: { uri: string; connectionLimit?: number }): MysqlPool;
}

let mysqlLoaderOverride: (() => Promise<MysqlPromiseModule>) | null = null;

export function __setMysqlLoaderForTests(
  loader: (() => Promise<MysqlPromiseModule>) | null,
): void {
  mysqlLoaderOverride = loader;
}

async function loadMysql(): Promise<MysqlPromiseModule> {
  try {
    if (mysqlLoaderOverride !== null) {
      return await mysqlLoaderOverride();
    }
    const mod = (await import("mysql2/promise")) as unknown as { default?: MysqlPromiseModule } & MysqlPromiseModule;
    return mod.default ?? mod;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ERR_MODULE_NOT_FOUND" || errno.code === "MODULE_NOT_FOUND") {
      throw new ConfigError(
        "MySQL adapter requires the 'mysql2' peer dependency. Run: npm install mysql2",
      );
    }
    throw new DatabaseError(`Failed to load 'mysql2': ${(error as Error).message}`);
  }
}

export async function createMysqlAdapter(config: DatabaseConfig): Promise<DatabaseAdapter> {
  if (config.type !== "mysql") {
    throw new ConfigError(`Expected mysql config, got '${config.type}'`);
  }
  const mysql = await loadMysql();
  const pool = mysql.createPool({
    uri: resolveConnectionString(config.connectionString),
    connectionLimit: 1,
  });

  async function withConnection<T>(fn: (conn: MysqlConnection) => Promise<T>): Promise<T> {
    let conn: MysqlConnection;
    try {
      conn = await pool.getConnection();
    } catch (error) {
      throw mapMysqlError(error);
    }
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  const adapter: DatabaseAdapter = {
    engine: "mysql",
    readOnly: config.readOnly,

    async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
      return withConnection(async (conn) => {
        try {
          if (config.readOnly) {
            await conn.query("START TRANSACTION READ ONLY");
          }
          const [rowsRaw, fields] = await conn.query<unknown>(sql, params);
          if (config.readOnly) {
            await conn.query("COMMIT");
          }
          const rows = Array.isArray(rowsRaw) ? (rowsRaw as Record<string, unknown>[]) : [];
          const columns = (fields ?? []).map((f) => ({
            name: f.name,
            type: mysqlTypeName(f.columnType ?? f.type),
          }));
          return {
            rows,
            columns,
            rowCount: rows.length,
          };
        } catch (error) {
          if (config.readOnly) {
            try {
              await conn.query("ROLLBACK");
            } catch {
              // ignore rollback failure
            }
          }
          throw mapMysqlError(error);
        }
      });
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      const sql = schema
        ? "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_schema, table_name"
        : "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys') ORDER BY table_schema, table_name";
      const params = schema ? [schema] : [];
      const result = await this.query(sql, params);
      return result.rows.map((r) => ({
        schema: (r.table_schema as string | null) ?? null,
        name: r.table_name as string,
        type: (r.table_type as string)?.toUpperCase() === "VIEW" ? "view" : "table",
      }));
    },

    async describeTable(table: string, schema?: string): Promise<ColumnInfo[]> {
      const sql = schema
        ? `SELECT column_name, data_type, is_nullable, column_default, column_key
           FROM information_schema.columns
           WHERE table_name = ? AND table_schema = ?
           ORDER BY ordinal_position`
        : `SELECT column_name, data_type, is_nullable, column_default, column_key
           FROM information_schema.columns
           WHERE table_name = ? AND table_schema = DATABASE()
           ORDER BY ordinal_position`;
      const params = schema ? [table, schema] : [table];
      const result = await this.query(sql, params);
      return result.rows.map((r) => ({
        name: r.column_name as string,
        dataType: r.data_type as string,
        nullable: (r.is_nullable as string) === "YES",
        defaultValue: (r.column_default as string | null) ?? null,
        isPrimaryKey: r.column_key === "PRI",
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

function mysqlTypeName(typeId: number | undefined): string {
  if (typeId === undefined) {
    return "unknown";
  }
  switch (typeId) {
    case 1:
    case 2:
    case 3:
    case 8:
    case 9:
      return "integer";
    case 4:
    case 5:
    case 246:
      return "decimal";
    case 7:
    case 12:
      return "timestamp";
    case 10:
      return "date";
    case 16:
      return "boolean";
    case 252:
    case 253:
    case 254:
      return "text";
    case 245:
      return "json";
    default:
      return `mysql:${typeId}`;
  }
}

function mapMysqlError(error: unknown): DatabaseError {
  const errAny = error as { message?: string; code?: string; errno?: number };
  return new DatabaseError(errAny.message ?? "Unknown MySQL error", {
    mysqlCode: errAny.code,
    errno: errAny.errno,
  });
}
