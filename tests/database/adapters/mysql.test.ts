import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __setMysqlLoaderForTests,
  createMysqlAdapter,
} from "../../../src/tools/database/adapters/mysql.js";
import { McpDevtoolsConfigSchema } from "../../../src/types/config.js";
import { ConfigError, DatabaseError } from "../../../src/types/errors.js";

interface Call {
  sql: string;
  params?: unknown[];
}

function buildMockedMysql(rows: Record<string, unknown>[] = [], fields: { name: string; columnType?: number }[] = []) {
  const calls: Call[] = [];
  const release = vi.fn();
  const conn = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (/^(SELECT|SHOW|DESCRIBE)/i.test(sql.trim())) {
        return [rows, fields];
      }
      return [{ affectedRows: 0 }, []];
    }),
    release,
  };
  const pool = {
    getConnection: vi.fn(async () => conn),
    end: vi.fn(async () => undefined),
  };
  const createPool = vi.fn().mockReturnValue(pool);
  return { createPool, calls };
}

function mysqlConfig(readOnly: boolean) {
  const top = McpDevtoolsConfigSchema.parse({
    databases: {
      m: {
        type: "mysql",
        connectionString: "mysql://localhost/test",
        readOnly,
      },
    },
  });
  return top.databases["m"]!;
}

describe("mysql adapter (mocked)", () => {
  afterEach(() => {
    __setMysqlLoaderForTests(null);
  });

  it("wraps queries in START TRANSACTION READ ONLY / COMMIT when readOnly=true", async () => {
    const { createPool, calls } = buildMockedMysql([{ a: 1 }], [{ name: "a", columnType: 3 }]);
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(true));
    const result = await adapter.query("SELECT 1 AS a");
    expect(result.rows).toEqual([{ a: 1 }]);
    expect(result.columns[0]?.name).toBe("a");
    const sqls = calls.map((c) => c.sql);
    expect(sqls).toEqual(["START TRANSACTION READ ONLY", "SELECT 1 AS a", "COMMIT"]);
    await adapter.close();
  });

  it("does not wrap when readOnly=false", async () => {
    const { createPool, calls } = buildMockedMysql([{ ok: 1 }]);
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(false));
    await adapter.query("UPDATE x SET y = 1");
    expect(calls.map((c) => c.sql)).toEqual(["UPDATE x SET y = 1"]);
    await adapter.close();
  });

  it("listTables filters out internal schemas by default", async () => {
    const { createPool, calls } = buildMockedMysql([
      { table_schema: "app", table_name: "users", table_type: "BASE TABLE" },
    ]);
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(true));
    const tables = await adapter.listTables();
    expect(tables).toEqual([{ schema: "app", name: "users", type: "table" }]);
    const userQuery = calls.find((c) => c.sql.includes("information_schema.tables"));
    expect(userQuery?.sql).toContain("'mysql'");
    await adapter.close();
  });

  it("surfaces ConfigError when 'mysql2' is missing", async () => {
    __setMysqlLoaderForTests(async () => {
      const err = new Error("Cannot find module 'mysql2'") as NodeJS.ErrnoException;
      err.code = "ERR_MODULE_NOT_FOUND";
      throw err;
    });
    await expect(createMysqlAdapter(mysqlConfig(true))).rejects.toBeInstanceOf(ConfigError);
  });

  it("rolls back on query error in readOnly mode", async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce([{}, []])
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([{}, []]);
    const createPool = vi.fn().mockReturnValue({
      getConnection: vi.fn(async () => ({ query: queryFn, release: vi.fn() })),
      end: vi.fn(),
    });
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(true));
    await expect(adapter.query("SELECT * FROM oops")).rejects.toBeInstanceOf(DatabaseError);
    await adapter.close();
  });

  it("listTables narrows to a single schema when supplied", async () => {
    const { createPool, calls } = buildMockedMysql([
      { table_schema: "shop", table_name: "orders", table_type: "BASE TABLE" },
      { table_schema: "shop", table_name: "v_summary", table_type: "VIEW" },
    ]);
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(true));
    const tables = await adapter.listTables("shop");
    expect(tables).toEqual([
      { schema: "shop", name: "orders", type: "table" },
      { schema: "shop", name: "v_summary", type: "view" },
    ]);
    const userQuery = calls.find((c) => c.sql.includes("table_schema = ?"));
    expect(userQuery?.params).toEqual(["shop"]);
    await adapter.close();
  });

  it("describeTable returns column info with primary key flag", async () => {
    const { createPool } = buildMockedMysql([
      { column_name: "id", data_type: "int", is_nullable: "NO", column_default: null, column_key: "PRI" },
      { column_name: "email", data_type: "varchar", is_nullable: "YES", column_default: null, column_key: "" },
    ]);
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(true));
    const cols = await adapter.describeTable("users");
    expect(cols).toEqual([
      { name: "id", dataType: "int", nullable: false, defaultValue: null, isPrimaryKey: true },
      { name: "email", dataType: "varchar", nullable: true, defaultValue: null, isPrimaryKey: false },
    ]);
    await adapter.close();
  });

  it("rejects a config with the wrong type", async () => {
    await expect(
      createMysqlAdapter({
        type: "postgresql",
        connectionString: "postgres://x",
        readOnly: true,
        queryTimeoutMs: 1000,
        maxRows: 100,
      } as never),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("translates the common MySQL column types to friendly names", async () => {
    const fields = [
      { name: "tiny", columnType: 1 },
      { name: "short", columnType: 2 },
      { name: "long", columnType: 3 },
      { name: "longlong", columnType: 8 },
      { name: "int24", columnType: 9 },
      { name: "f", columnType: 4 },
      { name: "d", columnType: 5 },
      { name: "newdec", columnType: 246 },
      { name: "ts", columnType: 7 },
      { name: "dt", columnType: 12 },
      { name: "date", columnType: 10 },
      { name: "bit", columnType: 16 },
      { name: "blob", columnType: 252 },
      { name: "vstr", columnType: 253 },
      { name: "str", columnType: 254 },
      { name: "json", columnType: 245 },
      { name: "unknown", columnType: 99999 },
      { name: "missing" },
    ];
    const { createPool } = buildMockedMysql([{}], fields);
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(true));
    const result = await adapter.query("SELECT 1");
    const types = result.columns.map((c) => c.type);
    expect(types).toEqual([
      "integer",
      "integer",
      "integer",
      "integer",
      "integer",
      "decimal",
      "decimal",
      "decimal",
      "timestamp",
      "timestamp",
      "date",
      "boolean",
      "text",
      "text",
      "text",
      "json",
      "mysql:99999",
      "unknown",
    ]);
    await adapter.close();
  });

  it("wraps a connection-acquisition failure as DatabaseError", async () => {
    const createPool = vi.fn().mockReturnValue({
      getConnection: vi.fn(async () => {
        throw Object.assign(new Error("ER_ACCESS_DENIED"), { code: "ER_ACCESS_DENIED" });
      }),
      end: vi.fn(),
    });
    __setMysqlLoaderForTests(async () => ({ createPool }) as never);
    const adapter = await createMysqlAdapter(mysqlConfig(true));
    await expect(adapter.query("SELECT 1")).rejects.toBeInstanceOf(DatabaseError);
    await adapter.close();
  });
});
