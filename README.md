# mcp-devtools

[![npm version](https://img.shields.io/npm/v/@oscarmarin/mcp-devtools.svg?color=6366F1)](https://www.npmjs.com/package/@oscarmarin/mcp-devtools)
[![CI](https://github.com/marin1321/mcp-devtools/actions/workflows/ci.yml/badge.svg)](https://github.com/marin1321/mcp-devtools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)

> **AI-native developer tools via [Model Context Protocol](https://spec.modelcontextprotocol.io).**
> A production-grade MCP server that gives AI agents (Claude, Cursor, Copilot, Continue, ...)
> safe, scoped access to your local development environment.

## Why

The MCP ecosystem is full of single-purpose tutorials and vendor-locked
adapters. There is no well-maintained, multi-tool, framework-agnostic,
production-quality MCP package for everyday developer tooling.

`mcp-devtools` fills that gap with **14 tools**, **3 MCP Resources**,
**4 MCP Prompts**, a **Plugin API**, **two transport modes** (stdio + HTTP
with auth), and an **audit log** — built on patterns refined in production
at [DailyBot](https://www.dailybot.com/).

## Quick start

### stdio (default)

```bash
npx @oscarmarin/mcp-devtools
```

Add it to **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "devtools": {
      "command": "npx",
      "args": ["-y", "@oscarmarin/mcp-devtools"]
    }
  }
}
```

Or **Cursor** (`~/.cursor/mcp.json`): same block.

### HTTP transport

Create a `mcp-devtools.json` in your project root:

```json
{
  "transport": "http",
  "port": 3333,
  "auth": {
    "token": "env:MCP_AUTH_TOKEN"
  }
}
```

Then start the server:

```bash
npx @oscarmarin/mcp-devtools
```

The MCP endpoint will be available at `http://localhost:3333`.

## Tools

| Group      | Tools                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Filesystem | `read_file`, `write_file`, `list_directory`, `search_files`, `get_file_info`             |
| Database   | `query_db`, `list_tables`, `describe_table`                                              |
| Process    | `run_command`, `read_logs`, `get_env`, `list_processes`                                  |
| OpenAPI    | `parse_openapi`, `call_api`                                                              |

Per-tool reference: [`docs/tools/`](./docs/tools/).

## MCP Resources

The server exposes read-only data via MCP Resources:

| URI                        | Description                                  |
| -------------------------- | -------------------------------------------- |
| `devtools://tools`         | Catalog of all registered tools with schemas |
| `devtools://server-info`   | Server version, transport, scope, tool count |

## MCP Prompts

Curated prompt templates for common development workflows:

| Prompt              | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `debug_error`       | Systematically debug an error using mcp-devtools tools       |
| `code_review`       | Review a file for bugs, security issues, and code quality    |
| `explore_codebase`  | Explore and understand a project's structure and conventions |
| `refactor_function` | Refactor a function for readability, performance, or testability |

## Plugin API

Extend `mcp-devtools` with custom tools — no fork required.

**Config-based** (load at startup):

```json
{
  "plugins": ["./my-tools.js", "@scope/mcp-plugin-foo"]
}
```

Each plugin module default-exports an array of tool definitions:

```typescript
import { defineTool } from "@oscarmarin/mcp-devtools";
import { z } from "zod";

export default [
  defineTool({
    name: "my_tool",
    description: "Does something useful",
    inputSchema: z.object({ input: z.string() }),
    handler: async (args, config) => ({
      ok: true,
      data: { result: args.input.toUpperCase() },
    }),
  }),
];
```

## Configuration

Configuration is loaded by [`cosmiconfig`](https://github.com/cosmiconfig/cosmiconfig)
from `mcp-devtools.json`, `.mcp-devtoolsrc`, or the `mcpDevtools` key in
`package.json`. See [`mcp-devtools.example.json`](./mcp-devtools.example.json)
and [`docs/configuration.md`](./docs/configuration.md) for the full schema.

Zero-config is supported: running `npx @oscarmarin/mcp-devtools` with no config uses
schema defaults (RNF-05).

## Security

Four non-bypassable controls:

1. **Filesystem scope boundary.** Every path is resolved to an absolute and
   compared against `config.scope`. Symlinks that escape scope throw
   `SCOPE_VIOLATION`.
2. **Command allowlist.** `run_command` only executes binaries whose basename
   is in `allowedCommands`. Invocation uses `spawn(file, args)` (no shell), so
   shell-injection via the command argument is structurally impossible.
3. **Database read-only mode.** When `readOnly: true`, all SQL is parsed and
   `INSERT/UPDATE/DELETE/DROP/CREATE/GRANT` are rejected. Queries run in
   `BEGIN READ ONLY ... ROLLBACK` on PostgreSQL.
4. **HTTP Bearer auth.** When `auth.token` is configured, every HTTP request
   must include `Authorization: Bearer <token>`. Comparison uses
   `crypto.timingSafeEqual` to prevent timing attacks.

Additional safety measures:

- **Audit log.** Opt-in NDJSON log of every tool invocation with timing, sanitized
  inputs, and result status.
- **Secret masking.** `get_env` automatically masks values matching common
  secret patterns (`SECRET`, `TOKEN`, `PASSWORD`, `KEY`, etc.).
- **OpenAPI host restriction.** `call_api` only sends requests to hosts listed
  in the spec's `servers` array.
- **Output capping.** All tools cap their output to prevent context flooding
  (100KB for commands, 1MB for files, 200 rows for queries).

## Contributing

```bash
git clone https://github.com/marin1321/mcp-devtools.git
cd mcp-devtools
npm install
npm run dev       # tsup --watch
npm run test      # vitest
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full workflow and
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) for community guidelines.

## License

[MIT](./LICENSE) &copy; Oscar Humberto Marin Molina &mdash;
[oscarmarindev.com](https://www.oscarmarindev.com)
