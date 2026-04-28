import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMysqlAdapter } from "../../src/tools/database/adapters/mysql.js";
import type { DatabaseAdapter } from "../../src/tools/database/connection-pool.js";
import type { DatabaseConfig } from "../../src/types/config.js";

const MYSQL_URI = process.env.MYSQL_CONNECTION_STRING;
const skip = !process.env.CI_INTEGRATION;

describe.skipIf(skip)("MySQL integration", () => {
  let adapter: DatabaseAdapter;

  const config: DatabaseConfig = {
    type: "mysql",
    connectionString: MYSQL_URI ?? "",
    readOnly: false,
    queryTimeoutMs: 10_000,
    maxRows: 200,
  };

  beforeAll(async () => {
    adapter = await createMysqlAdapter(config);
    await adapter.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
      )
    `);
    await adapter.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0
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

  it("lists tables", async () => {
    const tables = await adapter.listTables();
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("products");
  });

  it("describes table columns", async () => {
    const cols = await adapter.describeTable("users");
    expect(cols.length).toBeGreaterThanOrEqual(3);
    const idCol = cols.find((c) => c.name === "id");
    expect(idCol).toBeDefined();
    expect(idCol!.isPrimaryKey).toBe(true);
  });

  it("enforces read-only via START TRANSACTION READ ONLY", async () => {
    const roAdapter = await createMysqlAdapter({ ...config, readOnly: true });
    try {
      await expect(
        roAdapter.query("INSERT INTO users (name, email) VALUES ('Eve', 'eve@test.com')"),
      ).rejects.toThrow();
    } finally {
      await roAdapter.close();
    }
  });

  it("handles parameterized queries", async () => {
    const result = await adapter.query("SELECT * FROM users WHERE id = ?", [1]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: "Alice" });
  });

  it("returns correct rowCount", async () => {
    const result = await adapter.query("SELECT * FROM users");
    expect(result.rowCount).toBe(2);
  });
});
