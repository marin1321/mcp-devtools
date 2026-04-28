import type { DatabaseConfig } from "../../types/config.js";
import { ConfigError } from "../../types/errors.js";

/**
 * Unified adapter contract for `pg` | `mysql2` | `better-sqlite3`.
 *
 * Each tool talks to this interface only; the concrete adapter is selected
 * at config-load time based on `DatabaseConfig.type`. DB clients are peer
 * dependencies so consumers only install what they actually use (RNF-06).
 */

export interface QueryResult {
  rows: Record<string, unknown>[];
  columns: { name: string; type: string }[];
  rowCount: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface TableInfo {
  schema: string | null;
  name: string;
  type: "table" | "view";
}

export interface DatabaseAdapter {
  readonly engine: DatabaseConfig["type"];
  readonly readOnly: boolean;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  listTables(schema?: string): Promise<TableInfo[]>;
  describeTable(table: string, schema?: string): Promise<ColumnInfo[]>;
  close(): Promise<void>;
}

export type AdapterFactory = (config: DatabaseConfig) => Promise<DatabaseAdapter>;

const defaultFactories: Record<DatabaseConfig["type"], AdapterFactory> = {
  postgresql: async (config) => {
    const { createPostgresAdapter } = await import("./adapters/postgres.js");
    return createPostgresAdapter(config);
  },
  mysql: async (config) => {
    const { createMysqlAdapter } = await import("./adapters/mysql.js");
    return createMysqlAdapter(config);
  },
  sqlite: async (config) => {
    const { createSqliteAdapter } = await import("./adapters/sqlite.js");
    return createSqliteAdapter(config);
  },
};

export interface ConnectionPool {
  get(name: string): Promise<DatabaseAdapter>;
  closeAll(): Promise<void>;
}

/**
 * Lazy, single-instance-per-name connection pool.
 *
 * Adapters are instantiated on first use; subsequent calls hit the cache. The
 * pool is owned by `McpDevtoolsServer` and torn down on shutdown via
 * {@link ConnectionPool.closeAll}.
 *
 * `factories` is injectable so tests can stub adapter creation without
 * touching the real database drivers.
 */
export function createConnectionPool(
  configs: Record<string, DatabaseConfig>,
  factories: Partial<Record<DatabaseConfig["type"], AdapterFactory>> = {},
): ConnectionPool {
  const cache = new Map<string, DatabaseAdapter>();
  const inflight = new Map<string, Promise<DatabaseAdapter>>();
  const resolved: Record<DatabaseConfig["type"], AdapterFactory> = {
    ...defaultFactories,
    ...factories,
  };

  return {
    async get(name: string): Promise<DatabaseAdapter> {
      const existing = cache.get(name);
      if (existing !== undefined) {
        return existing;
      }
      const pending = inflight.get(name);
      if (pending !== undefined) {
        return pending;
      }
      const cfg = configs[name];
      if (cfg === undefined) {
        throw new ConfigError(`Database connection '${name}' is not configured`, {
          available: Object.keys(configs),
        });
      }
      const factory = resolved[cfg.type];
      const promise = factory(cfg)
        .then((adapter) => {
          cache.set(name, adapter);
          inflight.delete(name);
          return adapter;
        })
        .catch((error: unknown) => {
          inflight.delete(name);
          throw error;
        });
      inflight.set(name, promise);
      return promise;
    },

    async closeAll(): Promise<void> {
      const adapters = [...cache.values()];
      cache.clear();
      await Promise.all(
        adapters.map(async (adapter) => {
          try {
            await adapter.close();
          } catch {
            // best-effort: never throw from shutdown
          }
        }),
      );
    },
  };
}

/**
 * Resolves a `connectionString` value, supporting `env:VAR_NAME` indirection
 * so secrets aren't embedded in the config file.
 */
export function resolveConnectionString(value: string): string {
  if (value.startsWith("env:")) {
    const key = value.slice("env:".length);
    const resolved = process.env[key];
    if (resolved === undefined || resolved.length === 0) {
      throw new ConfigError(`Environment variable '${key}' is not set or empty`, {
        envVar: key,
      });
    }
    return resolved;
  }
  return value;
}
