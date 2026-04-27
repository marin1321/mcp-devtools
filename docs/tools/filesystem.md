# Filesystem Tools

> Phase 0 placeholder. Detailed inputs/outputs/examples land in Phase 2.

| Tool             | Status | Description                                 |
| ---------------- | ------ | ------------------------------------------- |
| `read_file`      | stub   | Read file content with optional line range. |
| `write_file`     | stub   | Atomic write within scope.                  |
| `list_directory` | stub   | List entries with depth + glob.             |
| `search_files`   | stub   | Grep-like search with context lines.        |
| `get_file_info`  | stub   | stat + MIME + line count.                   |

All filesystem tools enforce scope boundary: any path that resolves outside
`config.scope` (including via symlinks) returns `SCOPE_VIOLATION`.
