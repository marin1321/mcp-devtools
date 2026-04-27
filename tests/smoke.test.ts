import { describe, expect, it } from "vitest";

import { McpDevtoolsConfigSchema } from "../src/types/config.js";
import { err, ok } from "../src/types/tool-result.js";

describe("smoke", () => {
  it("config schema applies defaults from an empty object", () => {
    const result = McpDevtoolsConfigSchema.parse({});
    expect(result.scope).toBe("./");
    expect(result.transport).toBe("stdio");
    expect(result.port).toBe(3333);
    expect(result.allowedCommands).toContain("npm");
    expect(result.commandTimeoutMs).toBe(30_000);
  });

  it("ok() and err() build typed discriminated results", () => {
    const success = ok({ value: 42 });
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.data.value).toBe(42);
    }

    const failure = err("X", "boom");
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe("X");
    }
  });
});
