# Configuration

> Phase 0 placeholder. Full annotated reference lands in Phase 2.

`mcp-devtools` uses [`cosmiconfig`](https://github.com/cosmiconfig/cosmiconfig)
to find your configuration. It searches (in order):

1. `MCP_DEVTOOLS_CONFIG` env var (explicit path)
2. `mcp-devtools.json` at the project root
3. `.mcp-devtoolsrc` / `.mcp-devtoolsrc.{json,yaml,yml,js}`
4. `package.json` `"mcpDevtools"` key

When no file is found, defaults from the schema are applied — running
`npx mcp-devtools` with zero config must just work (RNF-05).

See [`mcp-devtools.example.json`](../mcp-devtools.example.json) for a
fully-populated example.

## Schema overview

See [`src/types/config.ts`](../src/types/config.ts) for the canonical Zod
schema. Top-level keys:

| Key                     | Default                                | Description                                           |
| ----------------------- | -------------------------------------- | ----------------------------------------------------- |
| `scope`                 | `"./"`                                 | Filesystem scope root. Nothing outside is accessible. |
| `allowedCommands`       | `["npm","node","python","git","make"]` | Allowlist for `run_command`.                          |
| `commandTimeoutMs`      | `30000`                                | Hard timeout for `run_command`.                       |
| `commandOutputMaxBytes` | `102400`                               | Cap on stdout+stderr buffer for `run_command`.        |
| `databases`             | `{}`                                   | Named DB connections (postgresql / mysql / sqlite).   |
| `logs`                  | `{ paths: [], maxLines: 500 }`         | Log file paths exposed to `read_logs`.                |
| `transport`             | `"stdio"`                              | `"stdio"` (default) or `"http"`.                      |
| `port`                  | `3333`                                 | HTTP port (only when `transport: "http"`).            |
| `debug`                 | `false`                                | Force `LOG_LEVEL=debug`.                              |
