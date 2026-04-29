# Plugin API

Extend `mcp-devtools` with custom tools — no fork required.

## Config-based Loading

Add plugin module paths to your config:

```json
{
  "plugins": ["./my-tools.js", "@scope/mcp-plugin-foo"]
}
```

Relative paths are resolved from the `scope` directory. npm package names are resolved normally.

## Writing a Plugin

A plugin is a module that default-exports an array of tool definitions:

```typescript
import { defineTool } from "@oscarmarin/mcp-devtools";
import { z } from "zod";

export default [
  defineTool({
    name: "hello_world",
    description: "Greets the user",
    inputSchema: z.object({
      name: z.string().describe("Name to greet"),
    }),
    handler: async (args, config) => ({
      ok: true,
      data: { greeting: `Hello, ${args.name}!` },
    }),
  }),
];
```

## Public API

The following are exported from `@oscarmarin/mcp-devtools`:

| Export                            | Description                                   |
| --------------------------------- | --------------------------------------------- |
| `defineTool(def)`                 | Type-safe helper to create a `ToolDefinition` |
| `ToolDefinition`                  | Interface for tool registration               |
| `ToolResult<T>`                   | Discriminated union for handler return values |
| `ok(data, meta?)`                 | Create a success result                       |
| `err(code, msg, details?, meta?)` | Create an error result                        |
| `McpDevtoolsError`                | Base class for domain errors                  |
| `McpDevtoolsConfig`               | Read-only config type                         |

## Error Handling

Plugin tools receive the same `config` as built-in tools and inherit scope boundaries. Use the domain error classes for structured error reporting:

```typescript
import { defineTool, ScopeViolationError } from "@oscarmarin/mcp-devtools";

export default [
  defineTool({
    name: "safe_read",
    description: "Read with custom validation",
    inputSchema: z.object({ path: z.string() }),
    handler: async (args, config) => {
      if (args.path.includes("..")) {
        throw new ScopeViolationError("Path traversal not allowed");
      }
      return { ok: true, data: { content: "..." } };
    },
  }),
];
```

## Safety

- Plugins run in the same process as the server (no sandboxing)
- A plugin that throws is caught by the top-level error handler — it won't crash the server
- Invalid or missing plugin modules are skipped with a warning at startup
- Plugin tools appear in the audit log alongside built-in tools
