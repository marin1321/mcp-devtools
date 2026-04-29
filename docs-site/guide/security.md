# Security

`mcp-devtools` is designed for AI agents operating on developer machines. Every tool operates within enforced boundaries.

## Filesystem Scope

All file paths are resolved to absolute and compared against `config.scope`. Both the resolved path **and** any symlink target must stay inside the scope root.

A symlink that points outside scope returns `SCOPE_VIOLATION` — even if the symlink itself is inside scope.

## Command Allowlist

`run_command` only executes binaries whose basename is in `config.allowedCommands`. Commands run with `spawn(file, args)` — **no shell** — so shell injection via the command argument is structurally impossible.

Shell metacharacters (`;`, `|`, `&`, backtick, `$(`) in arguments are rejected.

The child process receives a minimal environment (`PATH`, `HOME`, `SystemRoot`) — the parent's env is never leaked.

## Database Read-Only

When `readOnly: true` (the default), writes are blocked at **two layers**:

1. **SQL parser guard** — rejects `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `GRANT`, and multi-statement queries before they reach the engine.
2. **Engine-level enforcement** — `BEGIN READ ONLY` on PostgreSQL, `START TRANSACTION READ ONLY` on MySQL, `readonly: true` on SQLite.

Result sets are capped at `maxRows` (default 200). Queries time out after `queryTimeoutMs` (default 10s).

## HTTP Bearer Auth

When `auth.token` is configured and the transport is HTTP, every request must include:

```
Authorization: Bearer <token>
```

Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks. The token supports `env:VAR` indirection so it never needs to be in the config file.

Requests without a valid token receive `401 Unauthorized`.

## Secret Masking

`get_env` automatically masks values for keys matching common secret patterns: `SECRET`, `TOKEN`, `PASSWORD`, `KEY`, `API_KEY`, `PRIVATE`, `CREDENTIAL` (case-insensitive).

## Audit Log

When `audit.enabled: true`, every tool invocation is logged to an NDJSON file:

```json
{
  "timestamp": "2026-04-28T12:00:00.000Z",
  "tool": "read_file",
  "inputSummary": { "path": "src/index.ts" },
  "durationMs": 12,
  "ok": true
}
```

Input summaries are sanitized: secrets are masked, long strings are truncated.

## OpenAPI Host Restriction

`call_api` only sends HTTP requests to hosts listed in the spec's `servers` array. Requests to unlisted hosts are rejected. This prevents an AI agent from using the tool as a proxy to arbitrary endpoints.

## Output Capping

All tools cap their output to prevent context window flooding:

| Tool type        | Cap               |
| ---------------- | ----------------- |
| File reads       | 1 MB              |
| Command output   | 100 KB per stream |
| Database queries | 200 rows          |
| API responses    | 100 KB body       |
| Log reads        | 500 lines         |
