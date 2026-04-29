# MCP Resources

MCP Resources are read-only data endpoints that clients can discover and fetch. `mcp-devtools` exposes two resources.

## `devtools://tools`

Returns a catalog of all registered tools with their names, descriptions, and JSON Schema input definitions.

```json
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read a text file inside the configured scope.",
      "inputSchema": { ... }
    }
  ]
}
```

This resource includes both built-in tools and any tools registered via plugins.

## `devtools://server-info`

Returns runtime information about the server instance.

```json
{
  "version": "1.0.0",
  "transport": "stdio",
  "scope": "/Users/dev/my-project",
  "toolCount": 14,
  "databaseConnections": ["default"],
  "nodeVersion": "v20.12.0"
}
```

## Usage

MCP Resources are automatically discoverable by compatible clients. In Claude Desktop, you can ask:

> "What tools are available in devtools?"

The client will fetch the `devtools://tools` resource to answer.
