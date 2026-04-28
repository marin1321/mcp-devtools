import { describe, expect, it } from "vitest";

import { createTransport } from "../src/transport.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";

describe("createTransport", () => {
  it("returns a stdio transport for the default config", () => {
    const config = McpDevtoolsConfigSchema.parse({ transport: "stdio" });
    const result = createTransport(config);
    expect(result.kind).toBe("stdio");
    expect(result.transport).toBeDefined();
    expect(typeof result.transport.send).toBe("function");
  });

  it("returns an http transport when configured", () => {
    const config = McpDevtoolsConfigSchema.parse({ transport: "http" });
    const result = createTransport(config);
    expect(result.kind).toBe("http");
    expect(result.transport).toBeDefined();
    expect(typeof result.transport.send).toBe("function");
  });
});
