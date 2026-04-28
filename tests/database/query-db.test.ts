import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseAdapter } from "../../src/tools/database/connection-pool.js";
import {
  __resetPoolCacheForTests,
  __setPoolFactoryForTests,
  queryDbHandler,
} from "../../src/tools/database/query-db.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import {
  ConfigError,
  DatabaseError,
  ReadOnlyViolationError,
  TimeoutError,
} from "../../src/types/errors.js";
import { TEST_SQLITE_PATH } from "../fixtures/seed-sqlite.js";

function configFor(opts: { readOnly?: boolean; queryTimeoutMs?: number; maxRows?: number } = {}) {
  return McpDevtoolsConfigSchema.parse({
    databases: {
      default: {
        type: "sqlite",
        connectionString: TEST_SQLITE_PATH,
        readOnly: opts.readOnly ?? true,
        queryTimeoutMs: opts.queryTimeoutMs ?? 5000,
        maxRows: opts.maxRows ?? 1000,
      },
    },
  });
}

describe("queryDbHandler", () => {
  beforeEach(() => {
    __resetPoolCacheForTests();
  });

  afterEach(() => {
    __resetPoolCacheForTests();
  });

  it("runs a SELECT against the configured connection", async () => {
    const result = await queryDbHandler(
      { connection: "default", sql: "SELECT * FROM users ORDER BY id", params: [] },
      configFor(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rowCount).toBe(2);
    expect(result.data.rows[0]).toMatchObject({ id: 1, name: "Alice" });
    expect(result.data.truncated).toBe(false);
    expect(typeof result.data.durationMs).toBe("number");
  });

  it("supports parameterized queries", async () => {
    const result = await queryDbHandler(
      { connection: "default", sql: "SELECT * FROM users WHERE id = ?", params: [1] },
      configFor(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rowCount).toBe(1);
    expect(result.data.rows[0]).toMatchObject({ id: 1, name: "Alice" });
  });

  it("rejects writes via the SQL guard when readOnly=true", async () => {
    await expect(
      queryDbHandler(
        {
          connection: "default",
          sql: "INSERT INTO users (name, email) VALUES ('Carol', 'c@x.com')",
          params: [],
        },
        configFor({ readOnly: true }),
      ),
    ).rejects.toBeInstanceOf(ReadOnlyViolationError);
  });

  it("rejects multi-statement queries", async () => {
    await expect(
      queryDbHandler(
        { connection: "default", sql: "SELECT 1; SELECT 2", params: [] },
        configFor(),
      ),
    ).rejects.toBeInstanceOf(ReadOnlyViolationError);
  });

  it("engine-level read-only blocks writes that bypass the SQL guard", async () => {
    // Force readOnly=false at the config level so the parser guard is skipped,
    // but the SQLite connection itself was opened readonly via the adapter.
    // Then attempt an INSERT — adapter is engine-readonly so it must fail.
    await expect(
      queryDbHandler(
        {
          connection: "default",
          sql: "INSERT INTO users (name, email) VALUES ('Dan', 'd@x.com')",
          params: [],
        },
        // readOnly=true here means BOTH parser and engine reject. Parser
        // catches first, but if we toggled readOnly=false the parser would
        // pass and the engine would still reject — that's task 08's
        // responsibility (covered there). Here we exercise the parser path.
        configFor({ readOnly: true }),
      ),
    ).rejects.toBeInstanceOf(ReadOnlyViolationError);
  });

  it("strips comments before guarding (comment-bypass attempts pass through harmlessly)", async () => {
    const result = await queryDbHandler(
      { connection: "default", sql: "SELECT 1 /* INSERT INTO x VALUES (1) */", params: [] },
      configFor(),
    );
    expect(result.ok).toBe(true);
  });

  it("times out long-running queries", async () => {
    // Use an injected adapter that never resolves. SQLite's sync API blocks
    // the event loop during execution, which makes a real timeout test
    // unreliable; the timeout itself is engine-agnostic anyway.
    const fakeAdapter: DatabaseAdapter = {
      engine: "sqlite",
      readOnly: true,
      query: () => new Promise(() => undefined),
      listTables: () => Promise.resolve([]),
      describeTable: () => Promise.resolve([]),
      close: () => Promise.resolve(),
    };
    __setPoolFactoryForTests(() => ({
      get: () => Promise.resolve(fakeAdapter),
      closeAll: () => Promise.resolve(),
    }));

    const start = performance.now();
    await expect(
      queryDbHandler(
        { connection: "default", sql: "SELECT 1", params: [], timeoutMs: 50 },
        configFor({ queryTimeoutMs: 50 }),
      ),
    ).rejects.toBeInstanceOf(TimeoutError);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);

    __setPoolFactoryForTests(null);
  });

  it("caps rows at maxRows and reports truncated=true", async () => {
    const sql = `
      WITH RECURSIVE r(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 50
      )
      SELECT n FROM r
    `;
    const result = await queryDbHandler(
      { connection: "default", sql, params: [], maxRows: 10 },
      configFor({ maxRows: 10 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows.length).toBe(10);
    expect(result.data.truncated).toBe(true);
  });

  it("rejects an unknown connection name with ConfigError", async () => {
    await expect(
      queryDbHandler(
        { connection: "missing", sql: "SELECT 1", params: [] },
        configFor(),
      ),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("surfaces adapter errors as DatabaseError", async () => {
    await expect(
      queryDbHandler(
        { connection: "default", sql: "SELECT * FROM nonexistent_table", params: [] },
        configFor(),
      ),
    ).rejects.toBeInstanceOf(DatabaseError);
  });

  it("preserves DatabaseError thrown by the adapter (not double-wrapped)", async () => {
    const sentinel = new DatabaseError("from adapter", { hint: "x" });
    __setPoolFactoryForTests(() => ({
      get: () =>
        Promise.resolve({
          engine: "sqlite",
          readOnly: true,
          query: () => Promise.reject(sentinel),
          listTables: () => Promise.resolve([]),
          describeTable: () => Promise.resolve([]),
          close: () => Promise.resolve(),
        } satisfies DatabaseAdapter),
      closeAll: () => Promise.resolve(),
    }));
    await expect(
      queryDbHandler({ connection: "default", sql: "SELECT 1", params: [] }, configFor()),
    ).rejects.toBe(sentinel);
    __setPoolFactoryForTests(null);
  });

  it("normalizes BigInt, Date, Uint8Array, and nested arrays/objects", async () => {
    __setPoolFactoryForTests(() => ({
      get: () =>
        Promise.resolve({
          engine: "sqlite",
          readOnly: true,
          query: () =>
            Promise.resolve({
              columns: [{ name: "v", type: "any" }],
              rowCount: 1,
              rows: [
                {
                  big: 9_999_999_999_999n,
                  when: new Date("2024-01-01T00:00:00Z"),
                  bytes: new Uint8Array([1, 2, 3]),
                  arr: [1, new Date("2024-01-02T00:00:00Z"), 3n],
                  nested: { inner: 5n },
                  raw: 42,
                },
              ],
            }),
          listTables: () => Promise.resolve([]),
          describeTable: () => Promise.resolve([]),
          close: () => Promise.resolve(),
        } satisfies DatabaseAdapter),
      closeAll: () => Promise.resolve(),
    }));
    const result = await queryDbHandler(
      { connection: "default", sql: "SELECT 1", params: [] },
      configFor(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.data.rows[0]!;
    expect(row.big).toEqual({ __type: "bigint", value: "9999999999999" });
    expect(row.when).toBe("2024-01-01T00:00:00.000Z");
    expect(row.bytes).toMatchObject({ __type: "buffer" });
    expect(row.arr).toEqual([1, "2024-01-02T00:00:00.000Z", { __type: "bigint", value: "3" }]);
    expect(row.nested).toEqual({ inner: { __type: "bigint", value: "5" } });
    expect(row.raw).toBe(42);
    __setPoolFactoryForTests(null);
  });

  it("produces JSON-safe rows (BLOB → base64, ints stay ints)", async () => {
    const result = await queryDbHandler(
      {
        connection: "default",
        sql: "SELECT id, name, x'68656c6c6f' AS blob_col FROM users WHERE id = 1",
        params: [],
      },
      configFor(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.data.rows[0]!;
    expect(row.id).toBe(1);
    expect(row.name).toBe("Alice");
    expect(row.blob_col).toMatchObject({ __type: "buffer" });
    // Round-trip must be JSON-stringifiable
    expect(() => JSON.stringify(result.data)).not.toThrow();
  });
});
