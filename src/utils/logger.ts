import pino, { type Logger } from "pino";

/**
 * Structured logger writing JSON to stderr (RF-07).
 *
 * stdio transport reserves stdout for protocol framing — never log there.
 * Level controlled via `LOG_LEVEL` env var; `DEBUG=true` forces "debug".
 */

const level =
  process.env["NODE_ENV"] === "test"
    ? (process.env["LOG_LEVEL"] ?? "silent")
    : process.env["DEBUG"] === "true"
      ? "debug"
      : (process.env["LOG_LEVEL"] ?? "info");

export const logger: Logger = pino(
  {
    level,
    base: { name: "mcp-devtools" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label): { level: string } => ({ level: label }),
    },
    redact: {
      paths: [
        "*.password",
        "*.connectionString",
        "*.token",
        "*.apiKey",
        "*.secret",
        "headers.authorization",
        "headers.cookie",
      ],
      censor: "[REDACTED]",
    },
  },
  pino.destination(2),
);

export type { Logger };
