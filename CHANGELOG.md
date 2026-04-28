# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and uses [Conventional Commits](https://www.conventionalcommits.org/) so
`semantic-release` can generate releases automatically.

## [0.1.0-rc.1] - 2026-04-27

First release candidate of the Phase 1 MVP. Ten of the fourteen v1 tools are
shipped behind hardened security boundaries (scope validation, command
allowlist, multi-layer database read-only enforcement). The remaining four
(`run_command` and the OpenAPI / log / env tools) ship in later phases —
`run_command` actually ships now, the other three remain `NOT_IMPLEMENTED`
stubs that respond cleanly without crashing the server.

### Added

- **MCP server core**: `@modelcontextprotocol/sdk` integration with stdio
  transport, a typed tool registry that converts Zod schemas to JSON Schema,
  and a domain-error → `isError: true` mapping that prevents handler
  failures from crashing the process.
- **Filesystem tools** (all scope-checked, no symlink escape):
  - `read_file` — text reads with line ranges, BOM handling, binary
    detection, and size capping.
  - `write_file` — atomic writes via temp file + `rename()`, with
    `createDirs`, multi-encoding support, and orphan-temp cleanup.
  - `list_directory` — recursive listing with glob filters, hidden-file
    control, 5000-entry cap, deterministic sorting, and symlink-loop
    detection.
  - `search_files` — ripgrep-style content search with regex/literal
    patterns, case-insensitivity, context lines, glob filters, binary skip,
    and ignored-directory list (`node_modules`, `.git`, etc.).
  - `get_file_info` — `lstat`-based metadata with MIME detection, line
    counting for text files, and out-of-scope symlink target flagging.
- **Database tools** (lazy connection pool, read-only by default):
  - `query_db` — parameterized SELECTs with parser-level read-only guard,
    engine-level read-only enforcement (`BEGIN READ ONLY` on Postgres,
    `START TRANSACTION READ ONLY` on MySQL, `readonly: true` on SQLite),
    timeout, row cap, and JSON-safe value serialization (Date → ISO,
    Buffer/Uint8Array → base64, BigInt → tagged string).
  - `list_tables` / `describe_table` — uniform metadata across PostgreSQL,
    MySQL, and SQLite with primary-key detection.
- **Process tools**:
  - `run_command` — allowlist-checked spawn with `shell: false`, scope-
    bounded `cwd`, restricted env, hard caps on stdout/stderr (100 KB per
    stream), timeout with SIGTERM → SIGKILL escalation.
- **Connection pool**: lazy, cached `DatabaseAdapter` instances per
  connection name, `closeAll()` on server shutdown, `env:VAR` indirection
  for connection strings.
- **Cursor rules**: English-only and structured planning workflow.

### Security

- Scope boundary enforced via lexical containment + symlink-following
  `realpath` check; both the path and any symlink target must stay inside
  the configured root.
- Command allowlist with `shell: false`, defensive metacharacter rejection
  on args, `PATH` / `HOME` / `SystemRoot` whitelisted in env (parent env
  not leaked).
- Database writes blocked at two layers: SQL string parser guard (rejects
  multi-statement queries and any non-read keyword) AND engine-level
  read-only mode.

### Known limitations

- Manual smoke testing in Claude Desktop / Cursor still pending — covered
  in Phase 2 sign-off.
- HTTP transport not yet implemented (planned for Phase 3).
- `read_logs`, `get_env`, `parse_openapi`, `call_api` ship as
  `NOT_IMPLEMENTED` stubs to keep the server response surface stable.

## [Unreleased]

### Added

- Phase 0 scaffolding: TypeScript strict config, tsup dual ESM/CJS build,
  ESLint 9 flat config, Prettier, Vitest with v8 coverage thresholds.
- Config schema (`McpDevtoolsConfigSchema`) and cosmiconfig loader.
- Domain error taxonomy (`ScopeViolationError`, `DatabaseError`,
  `CommandError`, etc.) and `ToolResult` discriminated union.
- Structured pino logger writing JSON to stderr with secret redaction.
- Tool stubs for all 14 v1 tools across filesystem, database, process,
  and openapi groups.
- GitHub Actions CI (lint + typecheck + test + build) and release pipeline.
