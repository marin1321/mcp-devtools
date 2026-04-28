# Getting Started

This walkthrough wires `mcp-devtools` into Claude Desktop and Cursor against
a local config that exercises the shipped tools.

## 1. Install

You can either run via `npx` or check out a local build for development.

```bash
npx -y @oscarmarin/mcp-devtools
```

For a local development build:

```bash
git clone https://github.com/marin1321/mcp-devtools.git
cd mcp-devtools
npm install
npm run build
# Resulting entry point: dist/index.js
```

## 2. Author a config

Create `mcp-devtools.json` next to your project root (any cosmiconfig path
works — `.mcp-devtoolsrc`, the `mcpDevtools` key in `package.json`, etc.):

```json
{
  "scope": "/absolute/path/to/your/project",
  "allowedCommands": ["npm", "node", "git", "make"],
  "commandTimeoutMs": 30000,
  "databases": {
    "local-sqlite": {
      "type": "sqlite",
      "connectionString": "/absolute/path/to/dev.sqlite",
      "readOnly": true,
      "queryTimeoutMs": 5000,
      "maxRows": 200
    }
  },
  "transport": "stdio",
  "debug": false
}
```

`scope` bounds every filesystem and `run_command` operation. `readOnly: true`
on a database connection enforces read-only at both the SQL parser layer and
the engine layer.

## 3. Wire it into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "devtools": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-devtools/dist/index.js"],
      "env": {
        "MCP_DEVTOOLS_CONFIG": "/absolute/path/to/mcp-devtools.json"
      }
    }
  }
}
```

Restart Claude Desktop. The MCP icon should show every shipped tool.

## 4. Wire it into Cursor

Drop the same block into `~/.cursor/mcp.json` and reload the IDE.

## 5. Smoke test

Ask the agent each of the following from chat. A clean response (no MCP
error) is the success signal.

- `echo_test` with `{ "message": "hola" }`
- `read_file` with `{ "path": "src/index.ts" }`
- `list_directory` with `{ "path": ".", "depth": 2 }`
- `search_files` with `{ "pattern": "TODO", "path": "." }`
- `get_file_info` with `{ "path": "package.json" }`
- `write_file` with `{ "path": "tmp/hello.txt", "content": "hi" }`
- `query_db` with `{ "connection": "local-sqlite", "sql": "SELECT 1 AS n" }`
- `list_tables` with `{ "connection": "local-sqlite" }`
- `describe_table` with `{ "connection": "local-sqlite", "table": "users" }`
- `run_command` with `{ "command": "node", "args": ["--version"] }`

Negative checks (each must surface a typed error, not a crash):

- `read_file` with `{ "path": "/etc/passwd" }` → `SCOPE_VIOLATION`
- `query_db` with `{ "sql": "INSERT INTO users VALUES (...)" }` against a
  read-only connection → `DATABASE_READONLY_VIOLATION`
- `run_command` with `{ "command": "rm" }` → `COMMAND_NOT_ALLOWED`

## Next steps

- [`configuration.md`](./configuration.md) — full config schema
- [`tools/`](./tools/) — per-tool reference (Phase 2)
