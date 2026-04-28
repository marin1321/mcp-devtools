# Process & Logs Tools

Tools for running allow-listed commands, reading log files, and inspecting
environment variables. All three enforce the configured `scope` for any file
path arguments.

---

### run_command

> Spawn an allow-listed binary with hard caps on time and output size.

Commands are executed with `shell: false` (never through a shell), so shell
injection is structurally impossible. Arguments containing shell metacharacters
(`;`, `|`, `&`, `` ` ``, `$(`, newlines) are explicitly rejected. Only binaries
listed in `config.allowedCommands` may be invoked.

**Input**

| Parameter   | Type                     | Required | Default    | Description                                                                   |
| ----------- | ------------------------ | -------- | ---------- | ----------------------------------------------------------------------------- |
| `command`   | `string`                 | yes      | --         | Bare binary name (must be in `allowedCommands`, no path).                     |
| `args`      | `string[]`               | no       | `[]`       | Arguments passed to the command.                                              |
| `cwd`       | `string`                 | no       | scope root | Working directory (must be within scope).                                     |
| `timeoutMs` | `number`                 | no       | `30000`    | Maximum runtime in ms (max 300 000). Overrides config default.                |
| `env`       | `Record<string, string>` | no       | --         | Extra env vars (merged with `PATH`, `HOME`). Keys must be `UPPER_SNAKE_CASE`. |

The child process environment is minimal: only `PATH`, `HOME`, and
`SystemRoot` (Windows) are inherited from the host, plus any explicit `env`
entries. stdout and stderr are each capped at 100 KB; if either exceeds the
cap the process is terminated.

**Output**

| Field        | Type             | Description                                        |
| ------------ | ---------------- | -------------------------------------------------- |
| `exitCode`   | `number`         | Process exit code (`-1` if killed before exit).    |
| `signal`     | `string \| null` | Signal name if the process was killed by a signal. |
| `stdout`     | `string`         | Captured standard output.                          |
| `stderr`     | `string`         | Captured standard error.                           |
| `durationMs` | `number`         | Wall-clock duration in milliseconds.               |
| `truncated`  | `boolean`        | `true` when output hit the 100 KB cap.             |
| `timedOut`   | `boolean`        | `true` when the process exceeded `timeoutMs`.      |

**Errors**

| Code                  | When                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `CONFIG`              | `allowedCommands` is empty (tool is disabled).                                     |
| `COMMAND_NOT_ALLOWED` | Binary is not in `allowedCommands`.                                                |
| `VALIDATION`          | Command contains whitespace/path separators, or args contain shell metacharacters. |
| `COMMAND`             | Spawn failure (binary not found in `PATH`, etc.).                                  |

**Example**

```jsonc
// Request
{ "command": "node", "args": ["--version"] }

// Response
{
  "exitCode": 0,
  "signal": null,
  "stdout": "v20.11.0\n",
  "stderr": "",
  "durationMs": 52,
  "truncated": false,
  "timedOut": false
}
```

```jsonc
// Error: command not allowed
// Request
{ "command": "rm", "args": ["-rf", "/"] }

// Response
{
  "error": {
    "code": "COMMAND_NOT_ALLOWED",
    "message": "Command 'rm' is not in allowedCommands",
    "details": { "command": "rm", "allowed": ["npm", "node", "git"] }
  }
}
```

---

### read_logs

> Tail and optionally filter a log file within the configured scope.

Reads the last N lines from a text file, with optional regex filtering and
JSON field extraction for structured logs.

**Input**

| Parameter   | Type     | Required | Default | Description                                                                             |
| ----------- | -------- | -------- | ------- | --------------------------------------------------------------------------------------- |
| `path`      | `string` | yes      | --      | Path to the log file, relative to scope root.                                           |
| `tail`      | `number` | no       | `200`   | Number of lines to read from the end (max 10 000).                                      |
| `filter`    | `string` | no       | --      | Regex pattern to filter lines (case-insensitive).                                       |
| `jsonField` | `string` | no       | --      | Dot-separated path to extract from JSON log lines (e.g. `"msg"` or `"context.userId"`). |

**Output**

| Field       | Type       | Description                                      |
| ----------- | ---------- | ------------------------------------------------ |
| `path`      | `string`   | The input path echoed back.                      |
| `lines`     | `string[]` | Matching lines from the tail of the file.        |
| `truncated` | `boolean`  | `true` when the file has more lines than `tail`. |

**Errors**

| Code              | When                                  |
| ----------------- | ------------------------------------- |
| `SCOPE_VIOLATION` | Path resolves outside `config.scope`. |
| `FILESYSTEM`      | File not found or permission denied.  |
| `FILESYSTEM`      | Path is not a regular file.           |
| `VALIDATION`      | Binary file detected.                 |

**Example**

```jsonc
// Request
{ "path": "logs/app.log", "tail": 5, "filter": "ERROR" }

// Response
{
  "path": "logs/app.log",
  "lines": [
    "2025-06-01T10:32:01Z ERROR [db] connection timeout",
    "2025-06-01T10:33:15Z ERROR [http] 503 /api/health"
  ],
  "truncated": true
}
```

```jsonc
// Error: file not found
// Request
{ "path": "logs/nonexistent.log" }

// Response
{
  "error": {
    "code": "FILESYSTEM",
    "message": "Failed to read file: ENOENT: no such file or directory"
  }
}
```

---

### get_env

> Read environment variables from a `.env` file or the process environment.

Secrets are masked by default: any variable whose name matches common secret
patterns (`SECRET`, `PASSWORD`, `TOKEN`, `KEY`, `API_KEY`, `PRIVATE`,
`CREDENTIAL`, `AUTH`, `APIKEY`) is replaced with `"****"`.

**Input**

| Parameter     | Type       | Required | Default    | Description                                                      |
| ------------- | ---------- | -------- | ---------- | ---------------------------------------------------------------- |
| `source`      | `string`   | no       | `"dotenv"` | `"dotenv"` to parse a `.env` file, or `"env"` for `process.env`. |
| `path`        | `string`   | no       | `".env"`   | Path to the `.env` file (only used when `source` is `"dotenv"`). |
| `keys`        | `string[]` | no       | --         | Filter to specific variable names. Omit to return all.           |
| `maskSecrets` | `boolean`  | no       | `true`     | Replace values of secret-looking keys with `"****"`.             |

**Output**

| Field       | Type                     | Description                 |
| ----------- | ------------------------ | --------------------------- |
| `variables` | `Record<string, string>` | Key-value map of variables. |

**Errors**

| Code              | When                                         |
| ----------------- | -------------------------------------------- |
| `SCOPE_VIOLATION` | `.env` path resolves outside `config.scope`. |
| `FILESYSTEM`      | `.env` file not found.                       |

**Example**

```jsonc
// Request
{ "source": "dotenv", "path": ".env", "keys": ["NODE_ENV", "DATABASE_URL", "API_KEY"] }

// Response
{
  "variables": {
    "NODE_ENV": "development",
    "DATABASE_URL": "postgres://localhost:5432/mydb",
    "API_KEY": "****"
  }
}
```

```jsonc
// Error: .env file not found
// Request
{ "source": "dotenv", "path": ".env.production" }

// Response
{
  "error": {
    "code": "FILESYSTEM",
    "message": "File not found: .env.production"
  }
}
```
