# Filesystem Tools

All filesystem tools enforce a **scope boundary**: any path that resolves
outside `config.scope` (including via symlinks) raises `SCOPE_VIOLATION`.
Hidden files (dotfiles) and common build directories (`node_modules`, `.git`,
`dist`, etc.) are skipped by default during recursive operations.

---

### read_file

> Read the UTF-8 content of a file, optionally limited to a line range.

**Input**

| Parameter   | Type     | Required | Default | Description                                           |
| ----------- | -------- | -------- | ------- | ----------------------------------------------------- |
| `path`      | `string` | yes      | --      | Relative path from the configured scope root.         |
| `startLine` | `number` | no       | --      | 1-based inclusive start line. Returns from this line. |
| `endLine`   | `number` | no       | --      | 1-based inclusive end line. Returns up to this line.  |

**Output**

| Field       | Type      | Description                                                    |
| ----------- | --------- | -------------------------------------------------------------- |
| `path`      | `string`  | The input path echoed back.                                    |
| `content`   | `string`  | File content (or the requested line range).                    |
| `lineCount` | `number`  | Number of lines in the returned content.                       |
| `encoding`  | `string`  | Detected encoding: `"utf-8"` or `"utf-8-bom"`.                 |
| `truncated` | `boolean` | `true` when the file exceeds 1 MB and was capped (whole-file). |

**Errors**

| Code              | When                                               |
| ----------------- | -------------------------------------------------- |
| `SCOPE_VIOLATION` | Path resolves outside `config.scope`.              |
| `VALIDATION`      | `startLine > endLine`.                             |
| `FILESYSTEM`      | File not found, permission denied, or is binary.   |
| `EISDIR`          | Path points to a directory.                        |
| `FILESYSTEM`      | Line range is out of bounds (`startLine > total`). |

**Example**

```jsonc
// Request
{ "path": "src/index.ts", "startLine": 1, "endLine": 5 }

// Response
{
  "path": "src/index.ts",
  "content": "import { createServer } from ...",
  "lineCount": 5,
  "encoding": "utf-8",
  "truncated": false
}
```

```jsonc
// Error: scope violation
// Request
{ "path": "/etc/passwd" }

// Response
{
  "error": {
    "code": "SCOPE_VIOLATION",
    "message": "Path is outside the configured scope"
  }
}
```

---

### write_file

> Atomically write content to a file within the configured scope.

Writes to a temporary sibling file first, then renames it over the target, so
readers never see a half-written file.

**Input**

| Parameter    | Type      | Required | Default   | Description                                                         |
| ------------ | --------- | -------- | --------- | ------------------------------------------------------------------- |
| `path`       | `string`  | yes      | --        | Relative path from the scope root.                                  |
| `content`    | `string`  | yes      | --        | The content to write.                                               |
| `encoding`   | `string`  | no       | `"utf-8"` | One of `"utf-8"`, `"utf8"`, `"ascii"`, `"base64"`, `"hex"`.         |
| `createDirs` | `boolean` | no       | `false`   | When `true`, creates missing parent directories (`mkdir -p` style). |

**Output**

| Field          | Type      | Description                                  |
| -------------- | --------- | -------------------------------------------- |
| `path`         | `string`  | The input path echoed back.                  |
| `bytesWritten` | `number`  | Number of bytes written to disk.             |
| `created`      | `boolean` | `true` if the file did not exist previously. |

**Errors**

| Code              | When                                                  |
| ----------------- | ----------------------------------------------------- |
| `SCOPE_VIOLATION` | Path resolves outside `config.scope`.                 |
| `VALIDATION`      | Invalid `base64` or `hex` content.                    |
| `FILESYSTEM`      | Parent directory missing and `createDirs` is `false`. |
| `EISDIR`          | Target path is an existing directory.                 |

**Example**

```jsonc
// Request
{ "path": "tmp/hello.txt", "content": "hello world\n", "createDirs": true }

// Response
{
  "path": "tmp/hello.txt",
  "bytesWritten": 12,
  "created": true
}
```

```jsonc
// Error: parent directory missing
// Request
{ "path": "nonexistent/dir/file.txt", "content": "data" }

// Response
{
  "error": {
    "code": "FILESYSTEM",
    "message": "Parent directory does not exist (set createDirs=true to create it)"
  }
}
```

---

### list_directory

> List directory entries recursively with depth control and glob filtering.

**Input**

| Parameter       | Type      | Required | Default | Description                                              |
| --------------- | --------- | -------- | ------- | -------------------------------------------------------- |
| `path`          | `string`  | no       | `"."`   | Relative path from the scope root.                       |
| `depth`         | `number`  | no       | `1`     | Recursion depth (0 = only the directory itself, max 20). |
| `glob`          | `string`  | no       | --      | Picomatch glob to filter entries (e.g. `"*.ts"`).        |
| `includeHidden` | `boolean` | no       | `false` | Include dotfiles and dot-directories.                    |

**Output**

| Field       | Type      | Description                                     |
| ----------- | --------- | ----------------------------------------------- |
| `root`      | `string`  | The listed directory path.                      |
| `entries`   | `array`   | Array of entry objects (see below).             |
| `truncated` | `boolean` | `true` when the result hit the 5 000-entry cap. |

Each entry in `entries`:

| Field        | Type     | Description                                      |
| ------------ | -------- | ------------------------------------------------ |
| `path`       | `string` | Path relative to the listed directory.           |
| `type`       | `string` | `"file"`, `"directory"`, or `"symlink"`.         |
| `size`       | `number` | File size in bytes (0 for directories/symlinks). |
| `modifiedAt` | `string` | ISO-8601 last-modified timestamp.                |

Common directories are skipped during recursion: `.git`, `node_modules`,
`dist`, `build`, `coverage`, `.next`, `.venv`, `__pycache__`, and others.

**Errors**

| Code              | When                                  |
| ----------------- | ------------------------------------- |
| `SCOPE_VIOLATION` | Path resolves outside `config.scope`. |
| `ENOTDIR`         | Path is not a directory.              |
| `FILESYSTEM`      | Permission denied or path not found.  |

**Example**

```jsonc
// Request
{ "path": "src", "depth": 2, "glob": "*.ts" }

// Response
{
  "root": "src",
  "entries": [
    { "path": "index.ts", "type": "file", "size": 1240, "modifiedAt": "2025-06-01T12:00:00.000Z" },
    { "path": "tools/echo.ts", "type": "file", "size": 420, "modifiedAt": "2025-06-01T12:00:00.000Z" }
  ],
  "truncated": false
}
```

```jsonc
// Error: not a directory
// Request
{ "path": "package.json" }

// Response
{
  "error": {
    "code": "ENOTDIR",
    "message": "Path is not a directory"
  }
}
```

---

### search_files

> Grep-like content search across files with context lines.

**Input**

| Parameter         | Type      | Required | Default | Description                                                      |
| ----------------- | --------- | -------- | ------- | ---------------------------------------------------------------- |
| `pattern`         | `string`  | yes      | --      | Search string (literal by default) or regex when `regex` is set. |
| `path`            | `string`  | no       | `"."`   | Directory to search, relative to scope root.                     |
| `glob`            | `string`  | no       | --      | Picomatch glob to filter filenames (e.g. `"*.ts"`).              |
| `regex`           | `boolean` | no       | `false` | Treat `pattern` as a regular expression.                         |
| `caseInsensitive` | `boolean` | no       | `false` | Ignore case when matching.                                       |
| `contextLines`    | `number`  | no       | `2`     | Lines of context before and after each match (max 20).           |
| `maxResults`      | `number`  | no       | `100`   | Maximum matches returned (max 1 000).                            |
| `includeHidden`   | `boolean` | no       | `false` | Include hidden files and directories.                            |

Binary files and files over 10 MB are automatically skipped. Lines longer than
4 096 characters are truncated with a trailing ellipsis.

**Output**

| Field          | Type      | Description                           |
| -------------- | --------- | ------------------------------------- |
| `matches`      | `array`   | Array of match objects (see below).   |
| `truncated`    | `boolean` | `true` when `maxResults` was reached. |
| `filesScanned` | `number`  | Total files inspected.                |

Each match object:

| Field    | Type       | Description                            |
| -------- | ---------- | -------------------------------------- |
| `file`   | `string`   | File path relative to the search root. |
| `line`   | `number`   | 1-based line number of the match.      |
| `match`  | `string`   | The matching line content.             |
| `before` | `string[]` | Context lines before the match.        |
| `after`  | `string[]` | Context lines after the match.         |

**Errors**

| Code              | When                                  |
| ----------------- | ------------------------------------- |
| `SCOPE_VIOLATION` | Path resolves outside `config.scope`. |
| `VALIDATION`      | Invalid regex pattern.                |
| `ENOTDIR`         | Search path is not a directory.       |

**Example**

```jsonc
// Request
{ "pattern": "TODO", "path": "src", "glob": "*.ts", "contextLines": 1 }

// Response
{
  "matches": [
    {
      "file": "tools/echo.ts",
      "line": 12,
      "match": "  // TODO: add input validation",
      "before": ["export async function echoHandler(input) {"],
      "after": ["  return ok({ message: input.message });"]
    }
  ],
  "truncated": false,
  "filesScanned": 28
}
```

```jsonc
// Error: invalid regex
// Request
{ "pattern": "[unclosed", "regex": true }

// Response
{
  "error": {
    "code": "VALIDATION",
    "message": "Invalid regex: Unterminated character class"
  }
}
```

---

### get_file_info

> Return metadata for a path: type, size, timestamps, MIME type, and line count.

Uses `lstat` (not `stat`) to faithfully report symlinks without following them.

**Input**

| Parameter | Type     | Required | Default | Description                        |
| --------- | -------- | -------- | ------- | ---------------------------------- |
| `path`    | `string` | yes      | --      | Relative path from the scope root. |

**Output**

| Field              | Type             | Description                                                       |
| ------------------ | ---------------- | ----------------------------------------------------------------- |
| `path`             | `string`         | The input path echoed back.                                       |
| `type`             | `string`         | `"file"`, `"directory"`, `"symlink"`, or `"other"`.               |
| `size`             | `number`         | Size in bytes.                                                    |
| `modifiedAt`       | `string`         | ISO-8601 last-modified timestamp.                                 |
| `createdAt`        | `string`         | ISO-8601 creation timestamp.                                      |
| `isSymlink`        | `boolean`        | Whether the path itself is a symbolic link.                       |
| `mime`             | `string \| null` | MIME type for files (e.g. `"text/typescript"`), `null` otherwise. |
| `lines`            | `number`         | Line count (only for text files under 10 MB).                     |
| `linkTarget`       | `string`         | Symlink target path (only present for symlinks).                  |
| `linkEscapesScope` | `boolean`        | `true` if the symlink target is outside the configured scope.     |

**Errors**

| Code              | When                                  |
| ----------------- | ------------------------------------- |
| `SCOPE_VIOLATION` | Path resolves outside `config.scope`. |
| `FILESYSTEM`      | Path not found or permission denied.  |

**Example**

```jsonc
// Request
{ "path": "package.json" }

// Response
{
  "path": "package.json",
  "type": "file",
  "size": 1842,
  "modifiedAt": "2025-06-01T10:30:00.000Z",
  "createdAt": "2025-05-15T09:00:00.000Z",
  "isSymlink": false,
  "mime": "application/json",
  "lines": 48
}
```

```jsonc
// Error: file not found
// Request
{ "path": "nonexistent.txt" }

// Response
{
  "error": {
    "code": "FILESYSTEM",
    "message": "Failed to stat path: ENOENT: no such file or directory"
  }
}
```
