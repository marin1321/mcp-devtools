# Database Tools

Database tools connect to configured databases via named connections. All connections are lazy (created on first use) and read-only by default.

Supported engines: **PostgreSQL**, **MySQL**, **SQLite**.

## `query_db`

Execute a parameterized SQL query.

| Input        | Type        | Required | Description                            |
| ------------ | ----------- | -------- | -------------------------------------- |
| `connection` | `string`    | no       | Connection name (default: `"default"`) |
| `sql`        | `string`    | yes      | SQL query (SELECT only when readOnly)  |
| `params`     | `unknown[]` | no       | Query parameters                       |

**Output:** `{ rows, rowCount, columns }`

**Security:** When `readOnly: true`, the SQL is parsed to reject write keywords, and the query runs inside a read-only transaction at the engine level.

Values are serialized for JSON safety: `Date` → ISO string, `Buffer` → base64, `BigInt` → tagged string.

---

## `list_tables`

List tables in a database.

| Input        | Type     | Required | Description                            |
| ------------ | -------- | -------- | -------------------------------------- |
| `connection` | `string` | no       | Connection name (default: `"default"`) |
| `schema`     | `string` | no       | Schema filter (PostgreSQL)             |

**Output:** `{ tables: [{ name, schema?, type }] }`

---

## `describe_table`

Return column metadata for a table.

| Input        | Type     | Required | Description                            |
| ------------ | -------- | -------- | -------------------------------------- |
| `connection` | `string` | no       | Connection name (default: `"default"`) |
| `table`      | `string` | yes      | Table name                             |

**Output:** `{ columns: [{ name, type, nullable, defaultValue, isPrimaryKey }] }`
