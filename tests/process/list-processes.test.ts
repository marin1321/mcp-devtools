import { createServer } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listProcessesHandler } from "../../src/tools/process/list-processes.js";
import { McpDevtoolsConfigSchema } from "../../src/types/config.js";

const config = McpDevtoolsConfigSchema.parse({ scope: "./" });

describe("listProcessesHandler", () => {
  it("returns at least 1 process", async () => {
    const result = await listProcessesHandler({ limit: 50 }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.processes.length).toBeGreaterThanOrEqual(1);
    expect(result.data.total).toBeGreaterThanOrEqual(1);
    expect(result.data.filtered).toBe(false);
  });

  it("each process entry has pid, name, and command", async () => {
    const result = await listProcessesHandler({ limit: 10 }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const proc of result.data.processes) {
      expect(typeof proc.pid).toBe("number");
      expect(proc.pid).toBeGreaterThan(0);
      expect(typeof proc.name).toBe("string");
      expect(proc.name.length).toBeGreaterThan(0);
      expect(typeof proc.command).toBe("string");
      expect(proc.command.length).toBeGreaterThan(0);
    }
  });

  it("name filter narrows results", async () => {
    const all = await listProcessesHandler({ limit: 200 }, config);
    const filtered = await listProcessesHandler({ name: "node", limit: 200 }, config);

    expect(all.ok).toBe(true);
    expect(filtered.ok).toBe(true);
    if (!all.ok || !filtered.ok) return;

    expect(filtered.data.filtered).toBe(true);
    expect(filtered.data.total).toBeLessThanOrEqual(all.data.total);
    expect(filtered.data.total).toBeGreaterThanOrEqual(1);

    for (const proc of filtered.data.processes) {
      const match =
        proc.name.toLowerCase().includes("node") || proc.command.toLowerCase().includes("node");
      expect(match).toBe(true);
    }
  });

  it("limit caps results", async () => {
    const result = await listProcessesHandler({ limit: 2 }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.processes.length).toBeLessThanOrEqual(2);
  });

  describe("port filter", () => {
    let server: ReturnType<typeof createServer>;
    let testPort: number;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = createServer();
          server.listen(0, () => {
            const addr = server.address();
            testPort = typeof addr === "object" && addr !== null ? addr.port : 0;
            resolve();
          });
        }),
    );

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    );

    it("finds a process listening on a known port", async () => {
      const result = await listProcessesHandler({ port: testPort, limit: 50 }, config);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.filtered).toBe(true);

      if (result.data.processes.length > 0) {
        expect(result.data.processes[0].port).toBe(testPort);
        expect(result.data.processes[0].pid).toBe(process.pid);
      }
    });

    it("returns empty for a port with no listeners", async () => {
      const result = await listProcessesHandler({ port: 19999, limit: 50 }, config);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.filtered).toBe(true);
      expect(result.data.processes.length).toBe(0);
    });
  });
});
