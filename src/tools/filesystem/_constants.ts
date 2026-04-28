/**
 * Shared limits and defaults for the Filesystem tool family.
 *
 * Centralized so behavior is consistent across `read_file`, `write_file`,
 * `list_directory`, `search_files`, and `get_file_info`.
 */

/** Maximum bytes returned by `read_file` for a whole-file read. */
export const MAX_FILE_BYTES = 1024 * 1024;

/** Bytes inspected at the head of a file when sniffing for binary content. */
export const BINARY_DETECT_BYTES = 8192;

/** Maximum entries returned by `list_directory` in a single call. */
export const MAX_DIR_ENTRIES = 5000;

/** Maximum characters of a single line surfaced by `search_files`. */
export const MAX_LINE_LENGTH = 4096;

/**
 * Directory names skipped by default when walking the filesystem. Users can
 * still target them explicitly via `path` but they're never traversed during
 * recursion (perf + privacy).
 */
export const DEFAULT_IGNORE_DIRS: ReadonlySet<string> = new Set([
  ".git",
  ".cursor",
  ".vscode",
  ".idea",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "__pycache__",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);
