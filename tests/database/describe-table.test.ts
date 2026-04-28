import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetPoolCacheForTests,
  __setPoolFactoryForTests,
} from "../../src/tools/database/_pool.js";
import type { DatabaseAdapter } from "../../src/tools/database/connection-pool.js";
import { describeTableHandler } from "../../src/tools/database/describe-table.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { ConfigError, DatabaseError, ValidationError } from "../../src/types/errors.js";
import { TEST_SQLITE_PATH } from "../fixtures/seed-sqlite.js";

function realConfig() {
  return McpDevtoolsConfigSchema.parse({
    databases: {
      default: {
        type: "sqlite",
        connectionString: TEST_SQLITE_PATH,
        readOnly: true,
      },
    },
  });
}

function injectAdapter(adapter: DatabaseAdapter) {
  __setPoolFactoryForTests(() => ({
    get: () => Promise.resolve(adapter),
    closeAll: () => Promise.resolve(),
  }));
}

describe("describeTableHandler", () => {
  beforeEach(() => {
    __resetPoolCacheForTests();
  });

  afterEach(() => {
    __setPoolFactoryForTests(null);
  });

  it("returns columns for the SQLite users table with correct PK and nullability", async () => {
    const result = await describeTableHandler(
      { connection: "default", table: "users" },
      realConfig(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const colNames = result.data.columns.map((c) => c.name);
    expect(colNames).toEqual(["id", "name", "email"]);
    const id = result.data.columns.find((c) => c.name === "id")!;
    expect(id.isPrimaryKey).toBe(true);
    const name = result.data.columns.find((c) => c.name === "name")!;
    expect(name.nullable).toBe(false);
  });

  it("rejects an empty/whitespace table name with ValidationError", async () => {
    await expect(
      describeTableHandler({ connection: "default", table: "   " }, realConfig()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown connection with ConfigError", async () => {
    await expect(
      describeTableHandler({ connection: "unknown", table: "users" }, realConfig()),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("translates an empty column list into a 'Table not found' DatabaseError", async () => {
    const adapter: DatabaseAdapter = {
      engine: "sqlite",
      readOnly: true,
      query: vi.fn(),
      listTables: vi.fn(),
      describeTable: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    };
    injectAdapter(adapter);
    await expect(
      describeTableHandler({ connection: "default", table: "missing" }, realConfig()),
    ).rejects.toBeInstanceOf(DatabaseError);
  });

  it("recognizes composite primary keys", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgresql",
      readOnly: true,
      query: vi.fn(),
      listTables: vi.fn(),
      describeTable: vi.fn().mockResolvedValue([
        {
          name: "user_id",
          dataType: "integer",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
        },
        {
          name: "role_id",
          dataType: "integer",
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
        },
        {
          name: "granted_at",
          dataType: "timestamp",
          nullable: true,
          defaultValue: null,
          isPrimaryKey: false,
        },
      ]),
      close: vi.fn(),
    };
    injectAdapter(adapter);
    const result = await describeTableHandler(
      { connection: "default", table: "user_roles", schema: "public" },
      realConfig(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pks = result.data.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    expect(pks).toEqual(["user_id", "role_id"]);
    expect(result.data.schema).toBe("public");
  });
});
