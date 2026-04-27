/**
 * Input sanitization helpers shared across tool handlers.
 *
 * These are NOT the only line of defense — each tool also enforces its own
 * domain rules (scope check, allowlist, read-only DB). These helpers exist to
 * reduce the surface area of obvious foot-guns.
 */

const SHELL_METACHARS = /[;&|`$<>()\\!*?[\]{}'"\n\r]/g;

/**
 * Strip shell metacharacters from a single argument value.
 *
 * Use only when forwarding strings into command builders. The primary defense
 * against injection is `spawn(file, args)` (no shell), not this function.
 */
export function stripShellMetachars(input: string): string {
  return input.replace(SHELL_METACHARS, "");
}

/**
 * Truncate a string buffer to `maxBytes`, returning the truncated value and
 * a flag indicating whether truncation occurred.
 */
export function truncateBytes(
  value: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const buf = Buffer.from(value, "utf8");
  if (buf.byteLength <= maxBytes) {
    return { value, truncated: false };
  }
  return { value: buf.subarray(0, maxBytes).toString("utf8"), truncated: true };
}

/**
 * Mask common secret-looking values in arbitrary strings before logging.
 * Looks for `KEY=value` and `Authorization: Bearer ...` patterns.
 */
export function maskSecretsInText(input: string): string {
  return input
    .replace(/(?<=(?:password|secret|token|key|apikey|api_key)\s*[=:]\s*)\S+/gi, "[REDACTED]")
    .replace(/(?<=Bearer\s+)\S+/gi, "[REDACTED]");
}
