# mcp-devtools

[![npm version](https://img.shields.io/npm/v/mcp-devtools.svg?color=6366F1)](https://www.npmjs.com/package/mcp-devtools)
[![CI](https://github.com/marin1321/mcp-devtools/actions/workflows/ci.yml/badge.svg)](https://github.com/marin1321/mcp-devtools/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/marin1321/mcp-devtools/branch/main/graph/badge.svg)](https://codecov.io/gh/marin1321/mcp-devtools)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> **AI-native developer tools via [Model Context Protocol](https://spec.modelcontextprotocol.io).**
> A production-grade MCP server that gives AI agents (Claude, Cursor, Copilot, Continue, …)
> safe, scoped access to your local development environment.

> **Status:** Phase 1 release candidate (`v0.1.0-rc.1`). Ten of the fourteen
> v1 tools are shipped behind hardened security boundaries; the remaining
> four ship in later phases as `NOT_IMPLEMENTED` stubs that respond cleanly.

## Why

The MCP ecosystem is full of single-purpose tutorials and vendor-locked
adapters. There is no well-maintained, multi-tool, framework-agnostic,
production-quality MCP package for everyday developer tooling.

`mcp-devtools` fills that gap with **14 tools across 4 categories** (filesystem,
database, process, OpenAPI), built on patterns refined in production at
[DailyBot](https://www.dailybot.com/): retry with jitter, structured logging,
typed error taxonomy, version stamps, exponential backoff.

## Quick start

```bash
npx @oscarmarin/mcp-devtools
```

Add it to Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "devtools": {
      "command": "npx",
      "args": ["-y", "mcp-devtools"]
    }
  }
}
```

Or Cursor (`~/.cursor/mcp.json`): same block.

## Tools

| Group      | Tools                                                                        | Status               |
| ---------- | ---------------------------------------------------------------------------- | -------------------- |
| Filesystem | `read_file`, `write_file`, `list_directory`, `search_files`, `get_file_info` | shipped              |
| Database   | `query_db`, `list_tables`, `describe_table`                                  | shipped              |
| Process    | `run_command`                                                                | shipped              |
| Process    | `read_logs`, `get_env`                                                       | stub (Phase 2)       |
| OpenAPI    | `parse_openapi`, `call_api`                                                  | stub (Phase 3)       |
| Debug      | `echo_test`                                                                  | shipped (smoke tool) |

Per-tool reference: [`docs/tools/`](./docs/tools/).

## Configuration

Configuration is loaded by [`cosmiconfig`](https://github.com/cosmiconfig/cosmiconfig)
from `mcp-devtools.json`, `.mcp-devtoolsrc`, or the `mcpDevtools` key in
`package.json`. See [`mcp-devtools.example.json`](./mcp-devtools.example.json)
and [`docs/configuration.md`](./docs/configuration.md) for the full schema.

Zero-config is supported: running `npx mcp-devtools` with no config uses
schema defaults (RNF-05).

## Security

Three non-bypassable controls:

1. **Filesystem scope boundary.** Every path is resolved to an absolute and
   compared against `config.scope`. Symlinks that escape scope throw
   `SCOPE_VIOLATION`.
2. **Command allowlist.** `run_command` only executes binaries whose basename
   is in `allowedCommands`. Invocation uses `spawn(file, args)` (no shell), so
   shell-injection via the command argument is structurally impossible.
3. **Database read-only mode.** When `readOnly: true`, all SQL is parsed and
   `INSERT/UPDATE/DELETE/DROP/CREATE/GRANT` are rejected. Result sets are
   capped (default 200 rows). Queries run in `BEGIN READ ONLY ... ROLLBACK`
   on PostgreSQL.

## Development

```bash
nvm use
npm install
cp .env.example .env
npm run dev       # tsup --watch
npm run test      # vitest
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full workflow.

## License

[MIT](./LICENSE) © Oscar Humberto Marín Molina —
[oscarmarindev.com](https://www.oscarmarindev.com)
