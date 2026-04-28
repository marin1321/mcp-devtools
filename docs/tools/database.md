# Database Tools

Database tools require at least one connection in `config.databases`. Supported
engines (installed as peer dependencies): **PostgreSQL** (`pg`), **MySQL**
(`mysql2`), and **SQLite** (`better-sqlite3`).

When a connection has `readOnly: true` (the default), writes are blocked at two
layers: a SQL statement parser guard and the engine-level read-only transaction.

---

### query_db

> Execute a SQL query against a configured database connection.

**Input**

| Parameter    | Type     | Required | Default     | Description                               |
| ------------ | -------- | -------- | ----------- | ----------------------------------------- |
| `connection` | `string` | no       | `"default"` | Named connection from `config.databases`. |
| `sql`        | `string` | yes      | --          | SQL statement to execute.                 |
| `params`     | `array`  | no       | `[]`        | Positional bind parameters.               |
| `timeoutMs`  | `number` | no       | per-config  | Query timeout in ms (max 300 000).        |
| `maxRows`    | `number` | no       | per-config  | Maximum rows returned (max 10 000).       |

When the connection is read-only, the SQL parser guard rejects any statement
that is not a `SELECT`, `WITH`, `EXPLAIN`, or `SHOW`. Non-JSON-safe values
(e.g. `Date`, `BigInt`, `Buffer`) are automatically serialized.

**Output**

| Field        | Type      | Description                                             |
| ------------ | --------- | ------------------------------------------------------- |
| `rows`       | `array`   | Array of row objects (`Record<string, unknown>`).       |
| `columns`    | `array`   | Column descriptors: `{ name: string, type: string }[]`. |
| `rowCount`   | `number`  | Number of rows in the response.                         |
| `truncated`  | `boolean` | `true` when the result set exceeded `maxRows`.          |
| `durationMs` | `number`  | Server-side query duration in milliseconds.             |

**Errors**

| Code                          | When                                         |
| ----------------------------- | -------------------------------------------- |
| `CONFIG`                      | Named connection is not configured.          |
| `DATABASE_READONLY_VIOLATION` | Write statement on a read-only connection.   |
| `DATABASE`                    | Query execution failed (syntax error, etc.). |
| `TIMEOUT`                     | Query exceeded `timeoutMs`.                  |

**Example**

```jsonc
// Request
{
  "connection": "local-sqlite",
  "sql": "SELECT id, name FROM users WHERE active = ?",
  "params": [true],
  "maxRows": 10
}

// Response
{
  "rows": [
    { "id": 1, "name": "Alice" },
    { "id": 3, "name": "Charlie" }
  ],
  "columns": [
    { "name": "id", "type": "INTEGER" },
    { "name": "name", "type": "TEXT" }
  ],
  "rowCount": 2,
  "truncated": false,
  "durationMs": 4
}
```

```jsonc
// Error: write on read-only connection
// Request
{ "connection": "local-sqlite", "sql": "INSERT INTO users (name) VALUES ('Eve')" }

// Response
{
  "error": {
    "code": "DATABASE_READONLY_VIOLATION",
    "message": "SQL guard rejected statement: INSERT is not allowed on read-only connections"
  }
}
```

---

### list_tables

> List user tables and views for a configured database connection.

System schemas are excluded. Results are sorted by `(schema, name)`.

**Input**

| Parameter    | Type     | Required | Default     | Description                                   |
| ------------ | -------- | -------- | ----------- | --------------------------------------------- |
| `connection` | `string` | no       | `"default"` | Named connection from `config.databases`.     |
| `schema`     | `string` | no       | --          | Filter to a specific schema (Postgres/MySQL). |

**Output**

| Field    | Type     | Description                            |
| -------- | -------- | -------------------------------------- |
| `tables` | `array`  | Array of table entries (see below).    |
| `count`  | `number` | Total number of tables/views returned. |

Each table entry:

| Field    | Type             | Description                      |
| -------- | ---------------- | -------------------------------- |
| `name`   | `string`         | Table or view name.              |
| `schema` | `string \| null` | Schema name (`null` for SQLite). |
| `type`   | `string`         | `"table"` or `"view"`.           |

**Errors**

| Code     | When                                |
| -------- | ----------------------------------- |
| `CONFIG` | Named connection is not configured. |

**Example**

```jsonc
// Request
{ "connection": "local-sqlite" }

// Response
{
  "tables": [
    { "name": "migrations", "schema": null, "type": "table" },
    { "name": "users", "schema": null, "type": "table" },
    { "name": "active_users", "schema": null, "type": "view" }
  ],
  "count": 3
}
```

```jsonc
// Error: connection not configured
// Request
{ "connection": "nonexistent" }

// Response
{
  "error": {
    "code": "CONFIG",
    "message": "Database connection 'nonexistent' is not configured",
    "details": { "available": ["local-sqlite"] }
  }
}
```

---

### describe_table

> Return column metadata for a single table.

Provides a uniform schema (`name`, `dataType`, `nullable`, `defaultValue`,
`isPrimaryKey`) across Postgres, MySQL, and SQLite.

**Input**

| Parameter    | Type     | Required | Default     | Description                               |
| ------------ | -------- | -------- | ----------- | ----------------------------------------- |
| `connection` | `string` | no       | `"default"` | Named connection from `config.databases`. |
| `table`      | `string` | yes      | --          | Table name.                               |
| `schema`     | `string` | no       | --          | Schema name (Postgres/MySQL).             |

**Output**

| Field     | Type             | Description                              |
| --------- | ---------------- | ---------------------------------------- |
| `table`   | `string`         | The table name echoed back.              |
| `schema`  | `string \| null` | The schema name, or `null`.              |
| `columns` | `array`          | Array of column descriptors (see below). |

Each column descriptor:

| Field          | Type             | Description                           |
| -------------- | ---------------- | ------------------------------------- |
| `name`         | `string`         | Column name.                          |
| `dataType`     | `string`         | Engine-specific data type.            |
| `nullable`     | `boolean`        | Whether the column accepts `NULL`.    |
| `defaultValue` | `string \| null` | Default value expression, or `null`.  |
| `isPrimaryKey` | `boolean`        | Whether the column is part of the PK. |

**Errors**

| Code         | When                                |
| ------------ | ----------------------------------- |
| `CONFIG`     | Named connection is not configured. |
| `VALIDATION` | Empty table name.                   |
| `DATABASE`   | Table not found.                    |

**Example**

```jsonc
// Request
{ "connection": "local-sqlite", "table": "users" }

// Response
{
  "table": "users",
  "schema": null,
  "columns": [
    { "name": "id", "dataType": "INTEGER", "nullable": false, "defaultValue": null, "isPrimaryKey": true },
    { "name": "name", "dataType": "TEXT", "nullable": false, "defaultValue": null, "isPrimaryKey": false },
    { "name": "email", "dataType": "TEXT", "nullable": true, "defaultValue": null, "isPrimaryKey": false },
    { "name": "active", "dataType": "INTEGER", "nullable": false, "defaultValue": "1", "isPrimaryKey": false }
  ]
}
```

```jsonc
// Error: table not found
// Request
{ "connection": "local-sqlite", "table": "nonexistent" }

// Response
{
  "error": {
    "code": "DATABASE",
    "message": "Table not found: nonexistent"
  }
}
```
