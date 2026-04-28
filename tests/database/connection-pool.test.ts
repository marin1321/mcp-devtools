import { describe, expect, it, vi } from "vitest";

import {
  createConnectionPool,
  type DatabaseAdapter,
} from "../../src/tools/database/connection-pool.js";
import { ConfigError } from "../../src/types/errors.js";

function makeAdapter(name: string): DatabaseAdapter {
  return {
    engine: "sqlite",
    readOnly: true,
    query: vi.fn().mockResolvedValue({ rows: [], columns: [], rowCount: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    name,
  } as unknown as DatabaseAdapter;
}

describe("createConnectionPool", () => {
  it("instantiates an adapter on first get and caches it", async () => {
    const factory = vi.fn(() => Promise.resolve(makeAdapter("a")));
    const pool = createConnectionPool(
      { default: { type: "sqlite", connectionString: ":memory:", readOnly: true, queryTimeoutMs: 1000, maxRows: 100 } },
      { sqlite: factory },
    );
    const a = await pool.get("default");
    const b = await pool.get("default");
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent gets for the same name", async () => {
    let resolveAdapter: (a: DatabaseAdapter) => void = () => undefined;
    const factory = vi.fn(
      () => new Promise<DatabaseAdapter>((r) => {
        resolveAdapter = r;
      }),
    );
    const pool = createConnectionPool(
      { x: { type: "sqlite", connectionString: ":memory:", readOnly: true, queryTimeoutMs: 1000, maxRows: 100 } },
      { sqlite: factory },
    );
    const p1 = pool.get("x");
    const p2 = pool.get("x");
    resolveAdapter(makeAdapter("x"));
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown connection name with ConfigError", async () => {
    const pool = createConnectionPool({});
    await expect(pool.get("missing")).rejects.toBeInstanceOf(ConfigError);
  });

  it("calls close() on every cached adapter during closeAll()", async () => {
    const adapterA = makeAdapter("a");
    const adapterB = makeAdapter("b");
    const pool = createConnectionPool(
      {
        a: { type: "sqlite", connectionString: ":memory:", readOnly: true, queryTimeoutMs: 1000, maxRows: 100 },
        b: { type: "sqlite", connectionString: ":memory:", readOnly: true, queryTimeoutMs: 1000, maxRows: 100 },
      },
      {
        sqlite: vi
          .fn()
          .mockResolvedValueOnce(adapterA)
          .mockResolvedValueOnce(adapterB),
      },
    );
    await pool.get("a");
    await pool.get("b");
    await pool.closeAll();
    expect(adapterA.close).toHaveBeenCalledTimes(1);
    expect(adapterB.close).toHaveBeenCalledTimes(1);
  });

  it("clears the inflight map when factory rejects (so retries can succeed)", async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(makeAdapter("ok"));
    const pool = createConnectionPool(
      { c: { type: "sqlite", connectionString: ":memory:", readOnly: true, queryTimeoutMs: 1000, maxRows: 100 } },
      { sqlite: factory },
    );
    await expect(pool.get("c")).rejects.toThrow("boom");
    await expect(pool.get("c")).resolves.toBeDefined();
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
