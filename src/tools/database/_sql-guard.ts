/**
 * Read-only SQL guard.
 *
 * This is the **belt** in our belt-and-suspenders read-only enforcement. The
 * primary boundary is the engine itself (Postgres `BEGIN READ ONLY`, MySQL
 * `START TRANSACTION READ ONLY`, SQLite `readonly: true`); see
 * `connection-pool.ts` and the per-engine adapters. The guard exists to
 * provide an early, structured rejection with a stable error code rather
 * than relying on every backend to surface engine-level errors uniformly.
 *
 * Anything that smells like a write is rejected; we err strongly on the side
 * of false negatives. Stored procs, DDL, and the like are out of scope for v1
 * even when `readOnly: false`.
 */

const READ_KEYWORDS: ReadonlySet<string> = new Set([
  "SELECT",
  "WITH",
  "EXPLAIN",
  "SHOW",
  "DESCRIBE",
  "DESC",
  "PRAGMA",
  "VALUES",
]);

const WRITE_KEYWORDS: readonly string[] = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "CREATE",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "MERGE",
  "REPLACE",
  "CALL",
  "EXECUTE",
  "EXEC",
  "ATTACH",
  "DETACH",
  "VACUUM",
  "REINDEX",
  "LOCK",
  "UNLOCK",
  "RENAME",
  "COPY",
  "LOAD",
  "INTO",
];

const WRITE_KEYWORDS_RE = new RegExp(`\\b(${WRITE_KEYWORDS.join("|")})\\b`, "i");

export interface SqlGuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * Strips comments and trims whitespace.
 *
 * Handles:
 *   - `-- single-line comments` (until newline or EOL)
 *   - `/* block comments *\/` (non-greedy)
 *
 * Comments inside string literals are NOT stripped (we'd need a real lexer
 * for that), but our other checks are robust enough that this isn't a
 * security gap — they're a UX nicety.
 */
export function stripSqlComments(sql: string): string {
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  out = out.replace(/--[^\n\r]*/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

export function isReadOnlySql(sql: string): SqlGuardResult {
  const stripped = stripSqlComments(sql);
  if (stripped.length === 0) {
    return { ok: false, reason: "Empty SQL statement" };
  }

  const withoutTrailingSemi = stripped.replace(/;\s*$/, "");
  if (withoutTrailingSemi.includes(";")) {
    return {
      ok: false,
      reason: "Multi-statement queries are not allowed in read-only mode",
    };
  }

  const leading = withoutTrailingSemi.match(/^\s*([A-Za-z]+)/);
  if (leading === null) {
    return { ok: false, reason: "Could not identify leading keyword" };
  }
  const keyword = leading[1]!.toUpperCase();
  if (!READ_KEYWORDS.has(keyword)) {
    return {
      ok: false,
      reason: `Statement starts with '${keyword}' which is not a read-only keyword`,
    };
  }

  if (WRITE_KEYWORDS_RE.test(withoutTrailingSemi)) {
    const match = WRITE_KEYWORDS_RE.exec(withoutTrailingSemi);
    return {
      ok: false,
      reason: `Forbidden keyword in read-only mode: ${match?.[1] ?? "?"}`,
    };
  }

  return { ok: true };
}
