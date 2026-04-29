# Process Tools

Tools for interacting with the local process environment.

## `run_command`

Spawn a process from the configured allowlist.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | `string` | yes | Binary name (must be in `allowedCommands`) |
| `args` | `string[]` | no | Command arguments |
| `cwd` | `string` | no | Working directory (must be within scope) |
| `env` | `Record<string, string>` | no | Additional environment variables |
| `timeoutMs` | `number` | no | Override default timeout |

**Output:** `{ stdout, stderr, exitCode, signal, timedOut }`

**Security:** Runs with `shell: false`. Shell metacharacters in args are rejected. Output capped at 100KB per stream. Timeout triggers SIGTERM → SIGKILL escalation.

---

## `read_logs`

Read the tail of a log file with optional filtering.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | yes | Path to log file (must match `logs.paths` globs) |
| `lines` | `number` | no | Number of lines from tail (default: `logs.maxLines`) |
| `filter` | `string` | no | Filter pattern (literal or regex) |
| `regex` | `boolean` | no | Treat filter as regex (default: `false`) |
| `jsonField` | `string` | no | Extract a field from JSON log lines (dot-notation) |

**Output:** `{ lines: string[], total, filtered }`

---

## `get_env`

Read environment variables with automatic secret masking.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | `string` | no | Path to `.env` file (default: `process.env`) |
| `keys` | `string[]` | no | Specific keys to return |
| `maskSecrets` | `boolean` | no | Mask sensitive values (default: `true`) |

**Output:** `{ variables: Record<string, string>, masked: string[] }`

Values matching secret patterns (`SECRET`, `TOKEN`, `PASSWORD`, `KEY`, `API_KEY`, `PRIVATE`, `CREDENTIAL`) are replaced with `***MASKED***`.

---

## `list_processes`

List running processes, optionally filtered by name or port.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | no | Filter by process name (case-insensitive substring) |
| `port` | `number` | no | Filter by TCP listening port |
| `limit` | `number` | no | Max results (default: 50, max: 200) |

**Output:** `{ processes: [{ pid, name, command, cpu?, memory?, port? }], total, filtered }`

Useful for diagnosing port conflicts ("what's running on port 3000?").
