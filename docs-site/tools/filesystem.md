# Filesystem Tools

All filesystem tools enforce the configured `scope` boundary. Paths outside scope return `SCOPE_VIOLATION`.

## `read_file`

Read a text file with optional line range.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | yes | Relative path from scope root |
| `startLine` | `number` | no | First line to read (1-based) |
| `endLine` | `number` | no | Last line to read (1-based) |

**Output:** `{ content, lines, truncated, encoding }`

**Errors:** `SCOPE_VIOLATION`, `FILESYSTEM_ERROR` (file not found, binary file)

---

## `write_file`

Write a file atomically (temp file + rename).

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | yes | Relative path from scope root |
| `content` | `string` | yes | File content to write |
| `encoding` | `string` | no | Encoding (default: `utf-8`) |
| `createDirs` | `boolean` | no | Create parent directories (default: `false`) |

**Output:** `{ path, bytes }`

**Errors:** `SCOPE_VIOLATION`, `FILESYSTEM_ERROR`

---

## `list_directory`

List directory entries with optional recursion and glob filtering.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | yes | Relative path from scope root |
| `recursive` | `boolean` | no | Recurse into subdirectories (default: `false`) |
| `depth` | `number` | no | Max recursion depth |
| `glob` | `string` | no | Glob pattern to filter entries |
| `includeHidden` | `boolean` | no | Include hidden files (default: `false`) |

**Output:** `{ entries: [{ name, path, type, size }], total, truncated }`

Capped at 5,000 entries.

---

## `search_files`

Search for a pattern across files (ripgrep-style).

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `pattern` | `string` | yes | Search pattern (literal or regex) |
| `path` | `string` | no | Directory to search (default: scope root) |
| `regex` | `boolean` | no | Treat pattern as regex (default: `false`) |
| `caseSensitive` | `boolean` | no | Case-sensitive search (default: `true`) |
| `contextLines` | `number` | no | Lines of context around matches |
| `glob` | `string` | no | Glob filter for files |

**Output:** `{ matches: [{ file, line, content, context }], totalMatches, filesSearched }`

---

## `get_file_info`

Return file metadata.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | yes | Relative path from scope root |

**Output:** `{ name, path, type, size, modified, mime, lines, isSymlink, symlinkTarget }`
