import { timingSafeEqual } from "node:crypto";

/**
 * Resolve a token configuration value.
 *
 * Supports `env:VAR_NAME` indirection (same convention used for database
 * connection strings) so secrets never need to be inlined in the config file.
 */
export function resolveToken(tokenConfig: string | undefined): string | undefined {
  if (!tokenConfig) return undefined;
  if (tokenConfig.startsWith("env:")) {
    return process.env[tokenConfig.slice(4)];
  }
  return tokenConfig;
}

/**
 * Constant-time comparison of the received `Authorization` header against the
 * expected token. Uses {@link timingSafeEqual} to prevent timing attacks.
 */
export function validateBearerToken(
  authHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (!authHeader) return false;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) return false;

  const received = Buffer.from(token, "utf-8");
  const expected = Buffer.from(expectedToken, "utf-8");

  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
