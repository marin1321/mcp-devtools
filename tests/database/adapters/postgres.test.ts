import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __setPgLoaderForTests,
  createPostgresAdapter,
} from "../../../src/tools/database/adapters/postgres.js";
import { McpDevtoolsConfigSchema } from "../../../src/types/config.js";
import { ConfigError, DatabaseError } from "../../../src/types/errors.js";

interface Call {
  text: string;
  values?: unknown[];
}

function buildMockedPg(rows: Record<string, unknown>[] = [], fields: { name: string; dataTypeID: number }[] = []) {
  const calls: Call[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (textOrConfig: string | { text: string; values?: unknown[] }) => {
      if (typeof textOrConfig === "string") {
        calls.push({ text: textOrConfig });
        return { rows: [], rowCount: 0, fields: [] };
      }
      calls.push(textOrConfig);
      return { rows, rowCount: rows.length, fields };
    }),
    release,
  };
  const poolInstance = {
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
  };
  class Pool {
    constructor(_opts: { connectionString: string; max?: number }) {
      return poolInstance;
    }
  }
  return { Pool, calls, release, poolInstance };
}

function pgConfig(readOnly: boolean) {
  const top = McpDevtoolsConfigSchema.parse({
    databases: {
      pg: {
        type: "postgresql",
        connectionString: "postgresql://localhost/test",
        readOnly,
      },
    },
  });
  return top.databases["pg"]!;
}

describe("postgres adapter (mocked)", () => {
  afterEach(() => {
    __setPgLoaderForTests(null);
  });

  it("wraps queries in BEGIN READ ONLY / COMMIT when readOnly=true", async () => {
    const { Pool, calls } = buildMockedPg([{ a: 1 }], [{ name: "a", dataTypeID: 23 }]);
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(true));
    const result = await adapter.query("SELECT 1 AS a");
    expect(result.rows).toEqual([{ a: 1 }]);
    expect(result.columns).toEqual([{ name: "a", type: "integer" }]);
    const texts = calls.map((c) => c.text);
    expect(texts).toEqual(["BEGIN READ ONLY", "SELECT 1 AS a", "COMMIT"]);
    await adapter.close();
  });

  it("does not wrap when readOnly=false", async () => {
    const { Pool, calls } = buildMockedPg([{ ok: true }]);
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(false));
    await adapter.query("UPDATE x SET y = 1");
    const texts = calls.map((c) => c.text);
    expect(texts).toEqual(["UPDATE x SET y = 1"]);
    await adapter.close();
  });

  it("rolls back on query error in readOnly mode", async () => {
    const poolInstance = {
      connect: vi.fn(async () => ({
        query: vi
          .fn()
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(new Error("syntax error"))
          .mockResolvedValueOnce({}),
        release: vi.fn(),
      })),
      end: vi.fn(),
    };
    class Pool {
      constructor(_opts: { connectionString: string; max?: number }) {
        return poolInstance;
      }
    }
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(true));
    await expect(adapter.query("SELECT * FROM oops")).rejects.toBeInstanceOf(DatabaseError);
    await adapter.close();
  });

  it("listTables filters out internal schemas", async () => {
    const { Pool, calls } = buildMockedPg([
      { table_schema: "public", table_name: "users", table_type: "BASE TABLE" },
    ]);
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(true));
    const tables = await adapter.listTables();
    expect(tables).toEqual([{ schema: "public", name: "users", type: "table" }]);
    const userQuery = calls.find((c) => c.text.includes("information_schema.tables"));
    expect(userQuery?.text).toContain("pg_catalog");
    await adapter.close();
  });

  it("surfaces a clean ConfigError when 'pg' is not installed", async () => {
    __setPgLoaderForTests(async () => {
      const err = new Error("Cannot find module 'pg'") as NodeJS.ErrnoException;
      err.code = "ERR_MODULE_NOT_FOUND";
      throw err;
    });
    await expect(createPostgresAdapter(pgConfig(true))).rejects.toBeInstanceOf(ConfigError);
  });

  it("listTables narrows to the supplied schema", async () => {
    const { Pool, calls } = buildMockedPg([
      { table_schema: "billing", table_name: "invoices", table_type: "BASE TABLE" },
      { table_schema: "billing", table_name: "v_summary", table_type: "VIEW" },
    ]);
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(true));
    const tables = await adapter.listTables("billing");
    expect(tables).toEqual([
      { schema: "billing", name: "invoices", type: "table" },
      { schema: "billing", name: "v_summary", type: "view" },
    ]);
    const tablesQuery = calls.find((c) => c.text.includes("table_schema = $1"));
    expect(tablesQuery?.values).toEqual(["billing"]);
    await adapter.close();
  });

  it("describeTable returns column info with primary keys flagged", async () => {
    const poolInstance = {
      connect: vi.fn(async () => ({
        query: vi.fn(async (textOrConfig: string | { text: string; values?: unknown[] }) => {
          const text = typeof textOrConfig === "string" ? textOrConfig : textOrConfig.text;
          if (text.includes("information_schema.columns")) {
            return {
              rows: [
                { column_name: "id", data_type: "integer", is_nullable: "NO", column_default: "nextval(...)" },
                { column_name: "email", data_type: "text", is_nullable: "YES", column_default: null },
              ],
              rowCount: 2,
              fields: [],
            };
          }
          if (text.includes("pg_index")) {
            return { rows: [{ column_name: "id" }], rowCount: 1, fields: [] };
          }
          return { rows: [], rowCount: 0, fields: [] };
        }),
        release: vi.fn(),
      })),
      end: vi.fn(),
    };
    class Pool {
      constructor(_opts: { connectionString: string; max?: number }) {
        return poolInstance;
      }
    }
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(true));
    const cols = await adapter.describeTable("users");
    expect(cols).toEqual([
      { name: "id", dataType: "integer", nullable: false, defaultValue: "nextval(...)", isPrimaryKey: true },
      { name: "email", dataType: "text", nullable: true, defaultValue: null, isPrimaryKey: false },
    ]);
    await adapter.close();
  });

  it("wraps a connection-acquisition error as DatabaseError", async () => {
    const poolInstance = {
      connect: vi.fn(async () => {
        throw Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
      }),
      end: vi.fn(),
    };
    class Pool {
      constructor(_opts: { connectionString: string; max?: number }) {
        return poolInstance;
      }
    }
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(true));
    await expect(adapter.query("SELECT 1")).rejects.toBeInstanceOf(DatabaseError);
    await adapter.close();
  });

  it("rejects a config with the wrong type", async () => {
    await expect(
      createPostgresAdapter({
        type: "mysql",
        connectionString: "mysql://x",
        readOnly: true,
        queryTimeoutMs: 1000,
        maxRows: 100,
      } as never),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("translates the common Postgres OIDs to friendly type names", async () => {
    const fields = [
      { name: "b", dataTypeID: 16 }, // boolean
      { name: "i", dataTypeID: 23 }, // integer
      { name: "i2", dataTypeID: 21 },
      { name: "i8", dataTypeID: 20 },
      { name: "t", dataTypeID: 25 }, // text
      { name: "vc", dataTypeID: 1043 },
      { name: "ch", dataTypeID: 1042 },
      { name: "n", dataTypeID: 1700 }, // numeric
      { name: "f4", dataTypeID: 700 },
      { name: "f8", dataTypeID: 701 },
      { name: "d", dataTypeID: 1082 }, // date
      { name: "ts", dataTypeID: 1114 }, // timestamp
      { name: "tstz", dataTypeID: 1184 },
      { name: "j", dataTypeID: 114 }, // json
      { name: "jb", dataTypeID: 3802 },
      { name: "u", dataTypeID: 2950 }, // uuid
      { name: "x", dataTypeID: 99999 }, // unknown
    ];
    const { Pool } = buildMockedPg([{}], fields);
    __setPgLoaderForTests(async () => ({ Pool }) as never);
    const adapter = await createPostgresAdapter(pgConfig(true));
    const result = await adapter.query("SELECT 1");
    const types = result.columns.map((c) => c.type);
    expect(types).toEqual([
      "boolean",
      "integer",
      "integer",
      "integer",
      "text",
      "text",
      "text",
      "numeric",
      "numeric",
      "numeric",
      "date",
      "timestamp",
      "timestamp",
      "json",
      "json",
      "uuid",
      "oid:99999",
    ]);
    await adapter.close();
  });
});
