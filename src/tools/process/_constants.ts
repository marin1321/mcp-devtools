/**
 * Maximum bytes captured per stream (stdout, stderr) before we truncate and
 * kill the child. 100 KB matches the v1 plan and keeps responses well under
 * any reasonable MCP message size limit.
 */
export const MAX_OUTPUT_BYTES = 100 * 1024;

/**
 * After SIGTERM, the grace window before we follow up with SIGKILL. Keeps
 * misbehaving children that ignore SIGTERM from leaking past the call.
 */
export const KILL_GRACE_MS = 1_000;

/** Default `timeoutMs` if the caller doesn't pass one. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Defensive metacharacter blocklist for `args`. We never spawn through a
 * shell (`shell: false`), so these characters are inert from a process
 * perspective — but we reject them anyway so the contract is unambiguous:
 * `run_command` is a process call, not a shell pipeline. Agents that need
 * piping should chain multiple calls.
 *
 * `>` and `<` are deliberately NOT rejected: they're inert without a shell
 * and they collide with very common JS syntax that agents legitimately
 * pass to `node -e` (arrow functions, comparisons, JSX). `;`, `|`, `&`,
 * backticks, and newlines stay rejected, plus the literal substring `$(`.
 */
export const SHELL_METACHARS = /[;|&`\n\r]|\$\(/;

/** Allowed `env` variable name pattern (POSIX-ish). */
export const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
