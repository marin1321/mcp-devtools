import { describe, expect, it, vi } from "vitest";

import { retry } from "../../src/utils/retry.js";

describe("retry", () => {
  it("returns the value on the first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    let calls = 0;
    const fn = (): Promise<string> => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error("transient"));
      return Promise.resolve("done");
    };
    const result = await retry(fn, { attempts: 5, baseDelayMs: 1, maxDelayMs: 2 });
    expect(result).toBe("done");
    expect(calls).toBe(3);
  });

  it("rethrows after exhausting attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(retry(fn, { attempts: 2, baseDelayMs: 1, maxDelayMs: 1 })).rejects.toThrow(
      "boom",
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fatal"));
    await expect(
      retry(fn, { attempts: 5, baseDelayMs: 1, shouldRetry: () => false, label: "custom" }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses default options when none provided", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(retry(fn)).resolves.toBe(42);
  });
});
