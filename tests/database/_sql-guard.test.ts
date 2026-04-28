import { describe, expect, it } from "vitest";

import { isReadOnlySql, stripSqlComments } from "../../src/tools/database/_sql-guard.js";

const ALLOWED: string[] = [
  "SELECT 1",
  "SELECT * FROM users",
  "select * from users where id = 1",
  "SELECT u.name FROM users u JOIN orders o ON o.user_id = u.id",
  "SELECT COUNT(*) FROM orders",
  "WITH active AS (SELECT * FROM users WHERE active) SELECT * FROM active",
  "EXPLAIN SELECT * FROM users",
  "EXPLAIN ANALYZE SELECT 1",
  "SHOW TABLES",
  "DESCRIBE users",
  "DESC users",
  "PRAGMA table_info(users)",
  "VALUES (1, 2), (3, 4)",
  "SELECT 1;",
  "  SELECT 1  ",
  "/* leading comment */ SELECT 1",
  "-- a comment\nSELECT 1",
  "SELECT 1 /* trailing */",
  "SELECT * FROM users WHERE name LIKE '%Alice%'",
  "SELECT json_extract(meta, '$.id') FROM events",
];

const REJECTED: { sql: string; reason: RegExp }[] = [
  { sql: "INSERT INTO users (name) VALUES ('x')", reason: /not a read-only/ },
  { sql: "UPDATE users SET name = 'x'", reason: /not a read-only/ },
  { sql: "DELETE FROM users", reason: /not a read-only/ },
  { sql: "DROP TABLE users", reason: /not a read-only/ },
  { sql: "CREATE TABLE foo (id int)", reason: /not a read-only/ },
  { sql: "ALTER TABLE users ADD COLUMN x int", reason: /not a read-only/ },
  { sql: "TRUNCATE TABLE users", reason: /not a read-only/ },
  { sql: "GRANT SELECT ON users TO bob", reason: /not a read-only/ },
  { sql: "REVOKE SELECT ON users FROM bob", reason: /not a read-only/ },
  { sql: "MERGE INTO users USING ...", reason: /not a read-only/ },
  { sql: "REPLACE INTO users (id) VALUES (1)", reason: /not a read-only/ },
  { sql: "CALL my_proc()", reason: /not a read-only/ },
  { sql: "EXECUTE IMMEDIATE 'DROP TABLE x'", reason: /not a read-only/ },
  { sql: "ATTACH DATABASE 'x' AS y", reason: /not a read-only/ },
  { sql: "DETACH DATABASE y", reason: /not a read-only/ },
  { sql: "VACUUM", reason: /not a read-only/ },
  { sql: "REINDEX users", reason: /not a read-only/ },
  { sql: "SELECT 1; SELECT 2", reason: /Multi-statement/ },
  { sql: "SELECT 1; INSERT INTO users VALUES (1)", reason: /Multi-statement/ },
  { sql: "SELECT 1 INTO outfile '/tmp/x'", reason: /Forbidden/ },
  { sql: "SELECT * FROM users WHERE EXISTS (DELETE FROM x)", reason: /Forbidden/ },
  { sql: "WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x", reason: /Forbidden/ },
  { sql: "", reason: /Empty/ },
  { sql: "   ", reason: /Empty/ },
  { sql: "/* just a comment */", reason: /Empty/ },
  { sql: "-- just a comment", reason: /Empty/ },
  { sql: "RANDOM TOKEN", reason: /not a read-only/ },
  { sql: "1 + 1", reason: /identify leading keyword/i },
];

describe("stripSqlComments", () => {
  it("strips line comments", () => {
    expect(stripSqlComments("SELECT 1 -- comment\n FROM x")).toBe("SELECT 1 FROM x");
  });
  it("strips block comments", () => {
    expect(stripSqlComments("SELECT /* hi */ 1")).toBe("SELECT 1");
  });
  it("normalizes whitespace", () => {
    expect(stripSqlComments("  SELECT\n\n 1  ")).toBe("SELECT 1");
  });
});

describe("isReadOnlySql — allowed", () => {
  for (const sql of ALLOWED) {
    it(`allows: ${sql.replace(/\s+/g, " ").slice(0, 60)}`, () => {
      const result = isReadOnlySql(sql);
      expect(result.ok, `expected allowed but got: ${result.reason ?? ""}`).toBe(true);
    });
  }
});

describe("isReadOnlySql — rejected", () => {
  for (const { sql, reason } of REJECTED) {
    it(`rejects: ${sql.slice(0, 60) || "(empty)"}`, () => {
      const result = isReadOnlySql(sql);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(reason);
    });
  }
});
