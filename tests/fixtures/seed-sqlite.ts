import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEST_SQLITE_PATH = path.join(__dirname, "test.sqlite");

/**
 * Builds a fresh SQLite database used by the SQLite adapter integration tests.
 *
 * Run as Vitest's `globalSetup` so a single seed serves every worker. The
 * fixture is deterministic and small: 3 tables with a few rows each.
 */
export function setup(): void {
  mkdirSync(__dirname, { recursive: true });
  rmSync(TEST_SQLITE_PATH, { force: true });

  const db = new Database(TEST_SQLITE_PATH);
  try {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      INSERT INTO users (id, name, email) VALUES
        (1, 'Alice', 'alice@example.com'),
        (2, 'Bob',   'bob@example.com');
      INSERT INTO orders (id, user_id, total) VALUES
        (1, 1, 99.99),
        (2, 2, 12.50);
      INSERT INTO items (id, order_id, name) VALUES
        (1, 1, 'Widget'),
        (2, 1, 'Gadget'),
        (3, 2, 'Sprocket');
    `);
  } finally {
    db.close();
  }
}

export function teardown(): void {
  rmSync(TEST_SQLITE_PATH, { force: true });
}
