import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetPoolCacheForTests,
  __setPoolFactoryForTests,
} from "../../src/tools/database/_pool.js";
import type { DatabaseAdapter } from "../../src/tools/database/connection-pool.js";
import { listTablesHandler } from "../../src/tools/database/list-tables.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { ConfigError, DatabaseError } from "../../src/types/errors.js";
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

describe("listTablesHandler", () => {
  beforeEach(() => {
    __resetPoolCacheForTests();
  });

  afterEach(() => {
    __setPoolFactoryForTests(null);
  });

  it("returns the seeded SQLite tables in alphabetical order", async () => {
    const result = await listTablesHandler({ connection: "default" }, realConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.data.tables.map((t) => t.name);
    expect(names).toEqual(["items", "orders", "users"]);
    expect(result.data.count).toBe(3);
    expect(result.data.tables.every((t) => t.type === "table")).toBe(true);
  });

  it("rejects an unknown connection with ConfigError", async () => {
    await expect(listTablesHandler({ connection: "unknown" }, realConfig())).rejects.toBeInstanceOf(
      ConfigError,
    );
  });

  it("forwards a `schema` arg to the adapter", async () => {
    const adapter: DatabaseAdapter = {
      engine: "postgresql",
      readOnly: true,
      query: vi.fn(),
      listTables: vi.fn().mockResolvedValue([
        { schema: "public", name: "users", type: "table" },
        { schema: "public", name: "orders", type: "table" },
      ]),
      describeTable: vi.fn(),
      close: vi.fn(),
    };
    injectAdapter(adapter);
    const result = await listTablesHandler(
      { connection: "default", schema: "public" },
      realConfig(),
    );
    expect(adapter.listTables).toHaveBeenCalledWith("public");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tables.map((t) => t.name)).toEqual(["orders", "users"]);
  });

  it("propagates adapter errors as DatabaseError", async () => {
    const adapter: DatabaseAdapter = {
      engine: "sqlite",
      readOnly: true,
      query: vi.fn(),
      listTables: vi.fn().mockRejectedValue(new DatabaseError("boom")),
      describeTable: vi.fn(),
      close: vi.fn(),
    };
    injectAdapter(adapter);
    await expect(listTablesHandler({ connection: "default" }, realConfig())).rejects.toBeInstanceOf(
      DatabaseError,
    );
  });
});
