# Process & Logs Tools

> Phase 0 placeholder. Detailed inputs/outputs/examples land in Phase 2.

| Tool          | Status | Description                                            |
| ------------- | ------ | ------------------------------------------------------ |
| `run_command` | stub   | Spawn a binary from `allowedCommands` with timeout.    |
| `read_logs`   | stub   | Tail/filter a log file. JSON field filtering.          |
| `get_env`     | stub   | Read non-secret env vars from `.env` or `process.env`. |

`run_command` uses `child_process.spawn(file, args)` (no shell), so shell
injection via the `command` argument is structurally impossible. The
allowlist is matched against the binary basename only.
