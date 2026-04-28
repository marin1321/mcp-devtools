import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  defineTool,
  errorToCallToolResult,
  registerAllTools,
  registerTool,
  toolResultToCallToolResult,
} from "../src/tool-registry.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";
import { ScopeViolationError } from "../src/types/errors.js";
import { err, ok } from "../src/types/tool-result.js";

const config = McpDevtoolsConfigSchema.parse({});

describe("toolResultToCallToolResult", () => {
  it("maps an ok result to structuredContent + text content", () => {
    const result = toolResultToCallToolResult(ok({ value: 42 }));
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ value: 42 });
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0]).toMatchObject({ type: "text" });
  });

  it("maps an err result to isError=true with the original code", () => {
    const result = toolResultToCallToolResult(
      err("CUSTOM_CODE", "something went wrong", { hint: "x" }),
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "CUSTOM_CODE",
      message: "something went wrong",
      details: { hint: "x" },
    });
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: "[CUSTOM_CODE] something went wrong",
    });
  });

  it("omits details when not provided", () => {
    const result = toolResultToCallToolResult(err("X", "boom"));
    expect(result.structuredContent).toEqual({ code: "X", message: "boom" });
  });
});

describe("errorToCallToolResult", () => {
  it("maps a domain McpDevtoolsError to its stable code", () => {
    const error = new ScopeViolationError("escape", { path: "/tmp" });
    const result = errorToCallToolResult(error, "read_file");
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "SCOPE_VIOLATION",
      message: "escape",
      details: { path: "/tmp" },
    });
  });

  it("maps an unknown thrown error to INTERNAL_ERROR", () => {
    const result = errorToCallToolResult(new Error("kaboom"), "read_file");
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "INTERNAL_ERROR",
      message: "kaboom",
    });
  });

  it("stringifies non-Error throws", () => {
    const result = errorToCallToolResult("a string was thrown", "read_file");
    expect(result.structuredContent).toEqual({
      code: "INTERNAL_ERROR",
      message: "a string was thrown",
    });
  });
});

describe("defineTool", () => {
  it("preserves a typed handler signature at the call site", () => {
    const def = defineTool({
      name: "demo",
      description: "demo tool",
      inputSchema: z.object({ n: z.number() }),
      handler: (input) => Promise.resolve(ok({ doubled: input.n * 2 })),
    });
    expect(def.name).toBe("demo");
    expect(def.inputSchema).toBeDefined();
  });
});

interface FakeMcpServer {
  registerTool: ReturnType<typeof vi.fn>;
}

function makeFakeServer(): FakeMcpServer {
  return { registerTool: vi.fn() };
}

describe("registerTool", () => {
  it("forwards name + inputSchema.shape + description to the SDK", () => {
    const fake = makeFakeServer();
    const def = defineTool({
      name: "demo",
      title: "Demo",
      description: "demo tool",
      inputSchema: z.object({ n: z.number() }),
      handler: (input) => Promise.resolve(ok({ n: input.n })),
    });

    registerTool(fake as unknown as Parameters<typeof registerTool>[0], def, config);

    expect(fake.registerTool).toHaveBeenCalledTimes(1);
    const [name, registration] = fake.registerTool.mock.calls[0] as [
      string,
      { description: string; inputSchema: unknown; title?: string },
    ];
    expect(name).toBe("demo");
    expect(registration.title).toBe("Demo");
    expect(registration.description).toBe("demo tool");
    expect(registration.inputSchema).toBe(def.inputSchema.shape);
  });

  it("wraps the handler so a returned err becomes a CallToolResult", async () => {
    const fake = makeFakeServer();
    const def = defineTool({
      name: "demo",
      description: "demo tool",
      inputSchema: z.object({}),
      handler: () => Promise.resolve(err("BOOM", "nope")),
    });

    registerTool(fake as unknown as Parameters<typeof registerTool>[0], def, config);

    const wrapped = fake.registerTool.mock.calls[0]?.[2] as (input: unknown) => Promise<unknown>;
    const result = (await wrapped({})) as { isError?: boolean; structuredContent?: { code?: string } };
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.code).toBe("BOOM");
  });

  it("wraps the handler so a thrown McpDevtoolsError becomes a CallToolResult", async () => {
    const fake = makeFakeServer();
    const def = defineTool({
      name: "demo",
      description: "demo tool",
      inputSchema: z.object({}),
      handler: () => {
        throw new ScopeViolationError("escape");
      },
    });

    registerTool(fake as unknown as Parameters<typeof registerTool>[0], def, config);

    const wrapped = fake.registerTool.mock.calls[0]?.[2] as (input: unknown) => Promise<unknown>;
    const result = (await wrapped({})) as { isError?: boolean; structuredContent?: { code?: string } };
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.code).toBe("SCOPE_VIOLATION");
  });

  it("wraps the handler so an unknown thrown error becomes INTERNAL_ERROR", async () => {
    const fake = makeFakeServer();
    const def = defineTool({
      name: "demo",
      description: "demo tool",
      inputSchema: z.object({}),
      handler: () => {
        throw new Error("kaboom");
      },
    });

    registerTool(fake as unknown as Parameters<typeof registerTool>[0], def, config);

    const wrapped = fake.registerTool.mock.calls[0]?.[2] as (input: unknown) => Promise<unknown>;
    const result = (await wrapped({})) as { isError?: boolean; structuredContent?: { code?: string } };
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.code).toBe("INTERNAL_ERROR");
  });
});

describe("registerAllTools", () => {
  it("registers each tool in the list exactly once", () => {
    const fake = makeFakeServer();
    const tools = [
      defineTool({
        name: "a",
        description: "a",
        inputSchema: z.object({}),
        handler: () => Promise.resolve(ok({})),
      }),
      defineTool({
        name: "b",
        description: "b",
        inputSchema: z.object({}),
        handler: () => Promise.resolve(ok({})),
      }),
    ];

    registerAllTools(fake as unknown as Parameters<typeof registerAllTools>[0], tools, config);

    expect(fake.registerTool).toHaveBeenCalledTimes(2);
    expect(fake.registerTool.mock.calls[0]?.[0]).toBe("a");
    expect(fake.registerTool.mock.calls[1]?.[0]).toBe("b");
  });
});
