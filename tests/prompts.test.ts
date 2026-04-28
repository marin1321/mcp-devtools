import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { McpDevtoolsServer } from "../src/server.js";
import { McpDevtoolsConfigSchema } from "../src/types/config.js";

const PROMPT_NAMES = ["debug_error", "code_review", "explore_codebase", "refactor_function"];

describe("MCP Prompts", () => {
  let server: McpDevtoolsServer;
  let client: Client;

  beforeEach(async () => {
    const config = McpDevtoolsConfigSchema.parse({});
    server = new McpDevtoolsServer(config);
    client = new Client({ name: "test-client", version: "0.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.getServer().connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.getServer().close();
  });

  it("lists all 4 prompts", async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual([...PROMPT_NAMES].sort());
  });

  it("each prompt has a description", async () => {
    const { prompts } = await client.listPrompts();
    for (const prompt of prompts) {
      expect(prompt.description).toBeTruthy();
    }
  });

  describe("debug_error", () => {
    it("returns messages with required error_message argument", async () => {
      const result = await client.getPrompt({
        name: "debug_error",
        arguments: { error_message: "TypeError: Cannot read property 'x' of undefined" },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content.type).toBe("text");
      const text = (result.messages[0].content as { type: "text"; text: string }).text;
      expect(text).toContain("TypeError: Cannot read property 'x' of undefined");
      expect(text).toContain("search_files");
      expect(text).toContain("read_logs");
    });

    it("includes file_path in the prompt when provided", async () => {
      const result = await client.getPrompt({
        name: "debug_error",
        arguments: {
          error_message: "SyntaxError",
          file_path: "src/index.ts",
        },
      });
      const text = (result.messages[0].content as { type: "text"; text: string }).text;
      expect(text).toContain("src/index.ts");
    });

    it("works without optional file_path", async () => {
      const result = await client.getPrompt({
        name: "debug_error",
        arguments: { error_message: "Error" },
      });
      expect(result.messages).toHaveLength(1);
    });
  });

  describe("code_review", () => {
    it("returns messages with the file_path in instructions", async () => {
      const result = await client.getPrompt({
        name: "code_review",
        arguments: { file_path: "src/server.ts" },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      const text = (result.messages[0].content as { type: "text"; text: string }).text;
      expect(text).toContain("src/server.ts");
      expect(text).toContain("read_file");
      expect(text).toContain("search_files");
      expect(text).toContain("Security");
    });
  });

  describe("explore_codebase", () => {
    it("returns messages without focus_area", async () => {
      const result = await client.getPrompt({
        name: "explore_codebase",
        arguments: {},
      });
      expect(result.messages).toHaveLength(1);
      const text = (result.messages[0].content as { type: "text"; text: string }).text;
      expect(text).toContain("list_directory");
      expect(text).toContain("read_file");
    });

    it("includes focus_area in the prompt when provided", async () => {
      const result = await client.getPrompt({
        name: "explore_codebase",
        arguments: { focus_area: "database" },
      });
      const text = (result.messages[0].content as { type: "text"; text: string }).text;
      expect(text).toContain("database");
      expect(text).toContain("search_files");
    });
  });

  describe("refactor_function", () => {
    it("returns messages referencing the function and file", async () => {
      const result = await client.getPrompt({
        name: "refactor_function",
        arguments: {
          file_path: "src/utils/helpers.ts",
          function_name: "calculateTotal",
        },
      });
      expect(result.messages).toHaveLength(1);
      const text = (result.messages[0].content as { type: "text"; text: string }).text;
      expect(text).toContain("calculateTotal");
      expect(text).toContain("src/utils/helpers.ts");
      expect(text).toContain("read_file");
      expect(text).toContain("search_files");
      expect(text).toContain("Readability");
      expect(text).toContain("Performance");
      expect(text).toContain("Testability");
    });
  });
});
