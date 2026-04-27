# Getting Started

> Phase 0 placeholder. Full content lands in Phase 2 (`Stability & Docs`).

## Install

```bash
npx mcp-devtools
```

## Wire it into Claude Desktop

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

## Wire it into Cursor

Drop the same block into `~/.cursor/mcp.json`.

## Next steps

- See [`configuration.md`](./configuration.md) for the full config schema.
- See [`tools/`](./tools/) for the per-tool reference.
