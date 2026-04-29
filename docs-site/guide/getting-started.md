# Getting Started

## Installation

No installation required — run directly with `npx`:

```bash
npx @oscarmarin/mcp-devtools
```

Or install globally:

```bash
npm install -g @oscarmarin/mcp-devtools
```

## Configure Your MCP Client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Cursor

Edit `~/.cursor/mcp.json`:

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

### HTTP Transport

For remote or containerized use, create `mcp-devtools.json` in your project root:

```json
{
  "transport": "http",
  "port": 3333,
  "auth": {
    "token": "env:MCP_AUTH_TOKEN"
  }
}
```

Then start:

```bash
MCP_AUTH_TOKEN=my-secret npx @oscarmarin/mcp-devtools
```

The endpoint will be at `http://localhost:3333`.

## Verify

Once connected, ask your AI agent:

> "List the files in this directory"

It should invoke `list_directory` and return the contents of your project.

## Next Steps

- [Configuration](/guide/configuration) — customize scope, databases, commands
- [Tools Reference](/tools/filesystem) — full tool documentation
- [Plugins](/guide/plugins) — extend with custom tools
- [Security](/guide/security) — understand the safety model
