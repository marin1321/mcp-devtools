import { describe, expect, it } from "vitest";

import { createTransport } from "../src/transport.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";
import { ConfigError } from "../src/types/errors.js";

describe("createTransport", () => {
  it("returns a stdio transport for the default config", () => {
    const config = McpDevtoolsConfigSchema.parse({ transport: "stdio" });
    const transport = createTransport(config);
    expect(transport).toBeDefined();
    expect(typeof transport.send).toBe("function");
  });

  it("throws ConfigError for the http transport (Phase 3)", () => {
    const config = McpDevtoolsConfigSchema.parse({ transport: "http" });
    expect(() => createTransport(config)).toThrow(ConfigError);
  });
});
