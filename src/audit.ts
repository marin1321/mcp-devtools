import { appendFile } from "node:fs";
import { appendFile as appendFileAsync } from "node:fs/promises";
import path from "node:path";

import { logger } from "./utils/logger.js";

const SECRET_PATTERN = /secret|token|password|key|api_key|private|credential/i;
const MAX_STRING_LENGTH = 200;

export interface AuditEntry {
  timestamp: string;
  tool: string;
  inputSummary: unknown;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
}

/**
 * Sanitizes input values for audit logging: truncates long strings and masks
 * values whose keys match common secret patterns.
 */
function sanitizeValue(key: string, value: unknown): unknown {
  if (SECRET_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(String(index), item));
  }

  if (value !== null && typeof value === "object") {
    return sanitizeInput(value);
  }

  return value;
}

function sanitizeInput(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== "object") {
    return typeof input === "string" && input.length > MAX_STRING_LENGTH
      ? `${input.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : input;
  }

  if (Array.isArray(input)) {
    return input.map((item, index) => sanitizeValue(String(index), item));
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    result[k] = sanitizeValue(k, v);
  }
  return result;
}

/**
 * Append-only NDJSON audit logger. Fire-and-forget writes to avoid
 * blocking tool execution; pending writes are flushed on {@link close}.
 */
export class AuditLogger {
  private readonly filePath: string;
  private pendingWrites: Promise<void>[] = [];

  constructor(filePath: string, scopeDir?: string) {
    this.filePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(scopeDir ?? process.cwd(), filePath);
  }

  log(entry: AuditEntry): void {
    const sanitized: AuditEntry = {
      ...entry,
      inputSummary: sanitizeInput(entry.inputSummary),
    };
    const line = JSON.stringify(sanitized) + "\n";

    const writePromise = new Promise<void>((resolve) => {
      appendFile(this.filePath, line, "utf-8", (err) => {
        if (err) {
          logger.warn({ err, auditPath: this.filePath }, "failed to write audit entry");
        }
        resolve();
      });
    });

    this.pendingWrites.push(writePromise);
  }

  async close(): Promise<void> {
    await Promise.all(this.pendingWrites);
    this.pendingWrites = [];
  }

  /** Exposed for testing. */
  async writeSync(entry: AuditEntry): Promise<void> {
    const sanitized: AuditEntry = {
      ...entry,
      inputSummary: sanitizeInput(entry.inputSummary),
    };
    const line = JSON.stringify(sanitized) + "\n";
    await appendFileAsync(this.filePath, line, "utf-8");
  }
}

export { sanitizeInput as _sanitizeInputForTesting };
