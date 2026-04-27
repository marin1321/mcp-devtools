# Database Tools

> Phase 0 placeholder. Detailed inputs/outputs/examples land in Phase 2.

| Tool             | Status | Description                               |
| ---------------- | ------ | ----------------------------------------- |
| `query_db`       | stub   | Execute a SELECT (read-only by default).  |
| `list_tables`    | stub   | All tables/views with row count estimate. |
| `describe_table` | stub   | Columns, types, constraints, indexes.     |

Supported drivers (peer dependencies): `pg`, `mysql2`, `better-sqlite3`.

Read-only mode (default) blocks `INSERT`, `UPDATE`, `DELETE`, `DROP`,
`CREATE`, `GRANT`. Result sets are capped at `maxRows` (default 200).
