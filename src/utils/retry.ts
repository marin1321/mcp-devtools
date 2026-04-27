import { logger } from "./logger.js";

/**
 * Exponential backoff with full jitter (DailyBot pattern).
 *
 * Used for transient failures: DB connection drops, fetch ECONNRESET, etc.
 * Do NOT use for deterministic errors (validation, scope violation).
 */

export interface RetryOptions {
  /** Maximum attempts including the first one. */
  attempts?: number;
  /** Base delay in ms (default 100). */
  baseDelayMs?: number;
  /** Max delay cap in ms (default 5000). */
  maxDelayMs?: number;
  /** Predicate to decide whether an error is retryable. Default: all are. */
  shouldRetry?: (error: unknown) => boolean;
  /** Optional context for logs. */
  label?: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5_000,
    shouldRetry = (): boolean => true,
    label = "retry",
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLast = attempt === attempts;
      if (isLast || !shouldRetry(error)) {
        throw error;
      }
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.floor(Math.random() * exp);
      logger.debug({ label, attempt, delay, err: error }, "retrying after error");
      await sleep(delay);
    }
  }
  throw lastError;
}
