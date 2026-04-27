import type { DatabaseConfig } from "../../types/config.js";

/**
 * Unified adapter contract for `pg` | `mysql2` | `better-sqlite3`.
 *
 * Each tool talks to this interface only; the concrete adapter is selected
 * at config-load time based on `DatabaseConfig.type`. DB clients are peer
 * dependencies so consumers only install what they actually use (RNF-06).
 */

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
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
  rowCountEstimate: number | null;
  type: "table" | "view";
}

export interface DatabaseAdapter {
  readonly type: DatabaseConfig["type"];
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  listTables(): Promise<TableInfo[]>;
  describeTable(name: string): Promise<ColumnInfo[]>;
  close(): Promise<void>;
}

export interface ConnectionPool {
  get(name: string): Promise<DatabaseAdapter>;
  closeAll(): Promise<void>;
}

export function createConnectionPool(_configs: Record<string, DatabaseConfig>): ConnectionPool {
  return {
    get(): Promise<DatabaseAdapter> {
      return Promise.reject(new Error("ConnectionPool.get is not implemented yet"));
    },
    closeAll(): Promise<void> {
      return Promise.resolve();
    },
  };
}
