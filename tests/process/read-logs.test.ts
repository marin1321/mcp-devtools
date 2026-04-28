import { writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readLogsHandler } from "../../src/tools/process/read-logs.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";
import { FileSystemError, ScopeViolationError, ValidationError } from "../../src/types/errors.js";
import { createScopeFixture, type ScopeFixture } from "../fixtures/scope/setup.js";

function configFor(scope: string) {
  return McpDevtoolsConfigSchema.parse({ scope });
}

describe("readLogsHandler", () => {
  let fixture: ScopeFixture;

  beforeEach(() => {
    fixture = createScopeFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("returns the last N lines of a multi-line file", async () => {
    const logPath = path.join(fixture.root, "app.log");
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    writeFileSync(logPath, lines.join("\n") + "\n");

    const result = await readLogsHandler({ path: "app.log", tail: 5 }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["line16", "line17", "line18", "line19", "line20"]);
    expect(result.data.truncated).toBe(true);
    expect(result.data.path).toBe("app.log");
  });

  it("sets truncated=true when file has more lines than tail", async () => {
    const logPath = path.join(fixture.root, "big.log");
    const lines = Array.from({ length: 50 }, (_, i) => `entry${i}`);
    writeFileSync(logPath, lines.join("\n") + "\n");

    const result = await readLogsHandler({ path: "big.log", tail: 10 }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.truncated).toBe(true);
    expect(result.data.lines).toHaveLength(10);
  });

  it("sets truncated=false when file has fewer lines than tail", async () => {
    const logPath = path.join(fixture.root, "small.log");
    writeFileSync(logPath, "a\nb\nc\n");

    const result = await readLogsHandler({ path: "small.log", tail: 200 }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.truncated).toBe(false);
    expect(result.data.lines).toEqual(["a", "b", "c"]);
  });

  it("filters lines with a regex pattern", async () => {
    const logPath = path.join(fixture.root, "mixed.log");
    writeFileSync(logPath, "INFO started\nERROR disk full\nINFO running\nERROR timeout\n");

    const result = await readLogsHandler(
      { path: "mixed.log", tail: 200, filter: "^ERROR" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["ERROR disk full", "ERROR timeout"]);
  });

  it("filters lines with a literal string", async () => {
    const logPath = path.join(fixture.root, "lit.log");
    writeFileSync(logPath, "hello world\nfoo bar\nhello again\n");

    const result = await readLogsHandler(
      { path: "lit.log", tail: 200, filter: "hello" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["hello world", "hello again"]);
  });

  it("falls back to literal match when filter is an invalid regex", async () => {
    const logPath = path.join(fixture.root, "bracket.log");
    writeFileSync(logPath, "line [foo\nline bar\nline [foo] baz\n");

    const result = await readLogsHandler(
      { path: "bracket.log", tail: 200, filter: "[foo" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["line [foo", "line [foo] baz"]);
  });

  it("filter is case-insensitive", async () => {
    const logPath = path.join(fixture.root, "case.log");
    writeFileSync(logPath, "ERROR something\nerror other\nInfo ok\n");

    const result = await readLogsHandler(
      { path: "case.log", tail: 200, filter: "error" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["ERROR something", "error other"]);
  });

  it("extracts a top-level JSON field", async () => {
    const logPath = path.join(fixture.root, "json.log");
    const lines = [
      JSON.stringify({ level: "info", msg: "started" }),
      JSON.stringify({ level: "error", msg: "boom" }),
      JSON.stringify({ level: "debug", msg: "trace" }),
    ];
    writeFileSync(logPath, lines.join("\n") + "\n");

    const result = await readLogsHandler(
      { path: "json.log", tail: 200, jsonField: "level" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["info", "error", "debug"]);
  });

  it("extracts a nested JSON field with dot-notation", async () => {
    const logPath = path.join(fixture.root, "nested.log");
    const lines = [
      JSON.stringify({ error: { message: "not found", code: 404 } }),
      JSON.stringify({ error: { message: "timeout", code: 504 } }),
    ];
    writeFileSync(logPath, lines.join("\n") + "\n");

    const result = await readLogsHandler(
      { path: "nested.log", tail: 200, jsonField: "error.message" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["not found", "timeout"]);
  });

  it("skips lines that fail JSON.parse when jsonField is set", async () => {
    const logPath = path.join(fixture.root, "mixed-json.log");
    const lines = [
      JSON.stringify({ level: "info" }),
      "not json at all",
      JSON.stringify({ level: "warn" }),
    ];
    writeFileSync(logPath, lines.join("\n") + "\n");

    const result = await readLogsHandler(
      { path: "mixed-json.log", tail: 200, jsonField: "level" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["info", "warn"]);
  });

  it("skips lines where the requested JSON field does not exist", async () => {
    const logPath = path.join(fixture.root, "partial.log");
    const lines = [
      JSON.stringify({ level: "info", msg: "ok" }),
      JSON.stringify({ msg: "no level here" }),
      JSON.stringify({ level: "error", msg: "fail" }),
    ];
    writeFileSync(logPath, lines.join("\n") + "\n");

    const result = await readLogsHandler(
      { path: "partial.log", tail: 200, jsonField: "level" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["info", "error"]);
  });

  it("applies filter before jsonField extraction", async () => {
    const logPath = path.join(fixture.root, "combo.log");
    const lines = [
      JSON.stringify({ level: "info", msg: "started" }),
      JSON.stringify({ level: "error", msg: "disk full" }),
      JSON.stringify({ level: "info", msg: "stopped" }),
      JSON.stringify({ level: "error", msg: "timeout" }),
    ];
    writeFileSync(logPath, lines.join("\n") + "\n");

    const result = await readLogsHandler(
      { path: "combo.log", tail: 200, filter: "error", jsonField: "msg" },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["disk full", "timeout"]);
  });

  it("returns empty lines for an empty file", async () => {
    const logPath = path.join(fixture.root, "empty.log");
    writeFileSync(logPath, "");

    const result = await readLogsHandler({ path: "empty.log", tail: 200 }, configFor(fixture.root));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual([]);
    expect(result.data.truncated).toBe(false);
  });

  it("rejects binary files with ValidationError", async () => {
    const binPath = path.join(fixture.root, "binary.log");
    writeFileSync(binPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));

    await expect(
      readLogsHandler({ path: "binary.log", tail: 200 }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects paths outside the scope", async () => {
    await expect(
      readLogsHandler({ path: "/etc/passwd", tail: 200 }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("throws FileSystemError for a non-existent file", async () => {
    await expect(
      readLogsHandler({ path: "ghost.log", tail: 200 }, configFor(fixture.root)),
    ).rejects.toBeInstanceOf(FileSystemError);
  });

  it("handles files without a trailing newline", async () => {
    const logPath = path.join(fixture.root, "notail.log");
    writeFileSync(logPath, "alpha\nbeta\ngamma");

    const result = await readLogsHandler(
      { path: "notail.log", tail: 200 },
      configFor(fixture.root),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines).toEqual(["alpha", "beta", "gamma"]);
    expect(result.data.truncated).toBe(false);
  });
});
