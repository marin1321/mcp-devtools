# Configuration

Configuration is loaded by [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) from:

1. `mcp-devtools.json`
2. `.mcp-devtoolsrc` / `.mcp-devtoolsrc.json` / `.mcp-devtoolsrc.yaml`
3. `package.json` `"mcpDevtools"` key
4. `MCP_DEVTOOLS_CONFIG` environment variable (explicit path)

Zero config is supported — all keys have sensible defaults.

## Full Schema

```json
{
  "scope": "./",
  "allowedCommands": ["npm", "node", "python", "git", "make"],
  "commandTimeoutMs": 30000,
  "commandOutputMaxBytes": 102400,
  "databases": {
    "default": {
      "type": "postgresql",
      "connectionString": "env:DATABASE_URL",
      "readOnly": true,
      "queryTimeoutMs": 10000,
      "maxRows": 200
    }
  },
  "logs": {
    "paths": ["./logs/*.log"],
    "maxLines": 500
  },
  "transport": "stdio",
  "port": 3333,
  "debug": false,
  "plugins": [],
  "audit": {
    "enabled": false,
    "path": "./mcp-devtools-audit.ndjson"
  },
  "auth": {
    "token": "env:MCP_AUTH_TOKEN"
  }
}
```

## Key Reference

| Key                     | Type                             | Default                                | Description                                 |
| ----------------------- | -------------------------------- | -------------------------------------- | ------------------------------------------- |
| `scope`                 | `string`                         | `"./"`                                 | Root directory for filesystem operations    |
| `allowedCommands`       | `string[]`                       | `["npm","node","python","git","make"]` | Binaries that `run_command` may execute     |
| `commandTimeoutMs`      | `number`                         | `30000`                                | Maximum command execution time              |
| `commandOutputMaxBytes` | `number`                         | `102400`                               | Output cap per stream (stdout/stderr)       |
| `databases`             | `Record<string, DatabaseConfig>` | `{}`                                   | Named database connections                  |
| `logs.paths`            | `string[]`                       | `[]`                                   | Glob patterns for log files                 |
| `logs.maxLines`         | `number`                         | `500`                                  | Maximum lines returned by `read_logs`       |
| `transport`             | `"stdio" \| "http"`              | `"stdio"`                              | Transport mode                              |
| `port`                  | `number`                         | `3333`                                 | HTTP server port (when `transport: "http"`) |
| `debug`                 | `boolean`                        | `false`                                | Enable debug-level logging                  |
| `plugins`               | `string[]`                       | `[]`                                   | Plugin module paths to load at startup      |
| `audit.enabled`         | `boolean`                        | `false`                                | Enable invocation audit log                 |
| `audit.path`            | `string`                         | `"./mcp-devtools-audit.ndjson"`        | Audit log file path                         |
| `auth.token`            | `string?`                        | `undefined`                            | Bearer token for HTTP auth                  |

## Secret Indirection

Database connection strings and auth tokens support `env:VAR_NAME` syntax:

```json
{
  "databases": {
    "prod": {
      "type": "postgresql",
      "connectionString": "env:DATABASE_URL"
    }
  },
  "auth": {
    "token": "env:MCP_AUTH_TOKEN"
  }
}
```

This reads the value from the environment variable at runtime, so secrets never appear in the config file.
