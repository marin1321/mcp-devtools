import { describe, expect, it } from "vitest";

import { createSqliteAdapter } from "../../../src/tools/database/adapters/sqlite.js";
import { McpDevtoolsConfigSchema } from "../../../src/types/config.js";
import { DatabaseError } from "../../../src/types/errors.js";
import { TEST_SQLITE_PATH } from "../../fixtures/seed-sqlite.js";

function configFor(readOnly: boolean) {
  const top = McpDevtoolsConfigSchema.parse({
    databases: {
      test: {
        type: "sqlite",
        connectionString: TEST_SQLITE_PATH,
        readOnly,
      },
    },
  });
  return top.databases["test"]!;
}

describe("sqlite adapter", () => {
  it("runs a SELECT and returns typed rows + columns", async () => {
    const adapter = await createSqliteAdapter(configFor(true));
    try {
      const result = await adapter.query("SELECT 1 AS n, 'hi' AS greeting");
      expect(result.rows).toEqual([{ n: 1, greeting: "hi" }]);
      expect(result.rowCount).toBe(1);
      expect(result.columns.map((c) => c.name)).toEqual(["n", "greeting"]);
    } finally {
      await adapter.close();
    }
  });

  it("rejects writes when readOnly=true (engine-enforced)", async () => {
    const adapter = await createSqliteAdapter(configFor(true));
    try {
      await expect(
        adapter.query("INSERT INTO users (name, email) VALUES (?, ?)", [
          "Carol",
          "carol@example.com",
        ]),
      ).rejects.toBeInstanceOf(DatabaseError);
    } finally {
      await adapter.close();
    }
  });

  it("listTables returns the seeded fixture tables", async () => {
    const adapter = await createSqliteAdapter(configFor(true));
    try {
      const tables = await adapter.listTables();
      const names = tables.map((t) => t.name).sort();
      expect(names).toEqual(["items", "orders", "users"]);
      expect(tables.every((t) => t.type === "table")).toBe(true);
    } finally {
      await adapter.close();
    }
  });

  it("describeTable returns column metadata for users", async () => {
    const adapter = await createSqliteAdapter(configFor(true));
    try {
      const cols = await adapter.describeTable("users");
      const colNames = cols.map((c) => c.name);
      expect(colNames).toEqual(["id", "name", "email"]);
      const id = cols.find((c) => c.name === "id");
      expect(id?.isPrimaryKey).toBe(true);
      const name = cols.find((c) => c.name === "name");
      expect(name?.nullable).toBe(false);
    } finally {
      await adapter.close();
    }
  });

  it("rejects identifiers with suspicious characters in describeTable", async () => {
    const adapter = await createSqliteAdapter(configFor(true));
    try {
      await expect(adapter.describeTable("users; DROP TABLE users")).rejects.toBeInstanceOf(
        DatabaseError,
      );
    } finally {
      await adapter.close();
    }
  });

  it("supports parameterized queries", async () => {
    const adapter = await createSqliteAdapter(configFor(true));
    try {
      const result = await adapter.query("SELECT * FROM users WHERE id = ?", [1]);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]).toMatchObject({ id: 1, name: "Alice" });
    } finally {
      await adapter.close();
    }
  });
});
