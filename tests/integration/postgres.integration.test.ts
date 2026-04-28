import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresAdapter } from "../../src/tools/database/adapters/postgres.js";
import type { DatabaseAdapter } from "../../src/tools/database/connection-pool.js";
import type { DatabaseConfig } from "../../src/types/config.js";

const PG_URI = process.env.PG_CONNECTION_STRING;
const skip = !process.env.CI_INTEGRATION;

describe.skipIf(skip)("Postgres integration", () => {
  let adapter: DatabaseAdapter;

  const config: DatabaseConfig = {
    type: "postgresql",
    connectionString: PG_URI ?? "",
    readOnly: false,
    queryTimeoutMs: 10_000,
    maxRows: 200,
  };

  beforeAll(async () => {
    adapter = await createPostgresAdapter(config);
    await adapter.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      )
    `);
    await adapter.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL DEFAULT 0
      )
    `);
    await adapter.query(`DELETE FROM users`);
    await adapter.query(`DELETE FROM products`);
    await adapter.query(
      `INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@test.com'), (2, 'Bob', 'bob@test.com')`,
    );
    await adapter.query(`INSERT INTO products (id, name, price) VALUES (1, 'Widget', 9.99)`);
  });

  afterAll(async () => {
    await adapter.query(`DROP TABLE IF EXISTS products`);
    await adapter.query(`DROP TABLE IF EXISTS users`);
    await adapter.close();
  });

  it("queries rows", async () => {
    const result = await adapter.query("SELECT * FROM users ORDER BY id");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ name: "Alice" });
    expect(result.columns.length).toBeGreaterThan(0);
  });

  it("lists tables in public schema", async () => {
    const tables = await adapter.listTables("public");
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("products");
    expect(tables.every((t) => t.type === "table")).toBe(true);
  });

  it("describes table columns", async () => {
    const cols = await adapter.describeTable("users", "public");
    expect(cols.length).toBeGreaterThanOrEqual(3);
    const idCol = cols.find((c) => c.name === "id");
    expect(idCol).toBeDefined();
    expect(idCol!.isPrimaryKey).toBe(true);
  });

  it("enforces read-only via BEGIN READ ONLY", async () => {
    const roAdapter = await createPostgresAdapter({ ...config, readOnly: true });
    try {
      await expect(
        roAdapter.query("INSERT INTO users (name, email) VALUES ('Eve', 'eve@test.com')"),
      ).rejects.toThrow();
    } finally {
      await roAdapter.close();
    }
  });

  it("handles parameterized queries", async () => {
    const result = await adapter.query("SELECT * FROM users WHERE id = $1", [1]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: "Alice" });
  });

  it("returns correct rowCount", async () => {
    const result = await adapter.query("SELECT * FROM users");
    expect(result.rowCount).toBe(2);
  });
});
