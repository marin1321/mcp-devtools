import { describe, expect, it } from "vitest";

import {
  maskSecretsInText,
  stripShellMetachars,
  truncateBytes,
} from "../../src/utils/sanitize.js";

describe("stripShellMetachars", () => {
  it("removes shell-significant characters", () => {
    expect(stripShellMetachars("hello;rm -rf /")).toBe("hellorm -rf /");
    expect(stripShellMetachars("a|b&c$d`e>f<g")).toBe("abcdefg");
  });

  it("leaves benign strings untouched", () => {
    expect(stripShellMetachars("hello world")).toBe("hello world");
  });
});

describe("truncateBytes", () => {
  it("returns the original value when under the cap", () => {
    expect(truncateBytes("hi", 100)).toEqual({ value: "hi", truncated: false });
  });

  it("truncates UTF-8 strings to the byte limit", () => {
    const r = truncateBytes("abcdef", 3);
    expect(r.truncated).toBe(true);
    expect(r.value).toBe("abc");
  });

  it("truncates exactly at the limit without flagging truncation", () => {
    const r = truncateBytes("abc", 3);
    expect(r).toEqual({ value: "abc", truncated: false });
  });
});

describe("maskSecretsInText", () => {
  it("masks key=value style secrets case-insensitively", () => {
    expect(maskSecretsInText("password=hunter2 foo")).toContain("[REDACTED]");
    expect(maskSecretsInText("API_KEY=abc")).toContain("[REDACTED]");
  });

  it("masks Bearer tokens", () => {
    expect(maskSecretsInText("Authorization: Bearer eyJhbGciOi")).toContain("[REDACTED]");
  });

  it("does not change plain text", () => {
    expect(maskSecretsInText("hello world")).toBe("hello world");
  });
});
