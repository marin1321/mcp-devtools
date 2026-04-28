import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerRefactorFunctionPrompt(server: McpServer): void {
  server.registerPrompt(
    "refactor_function",
    {
      description: "Refactor a function for readability, performance, or testability",
      argsSchema: {
        file_path: z.string().describe("Path to the file containing the function"),
        function_name: z.string().describe("Name of the function to refactor"),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Refactor the function \`${args.function_name}\` in "${args.file_path}" using mcp-devtools tools.\n`,
              `Follow these steps:\n`,
              `1. Use the \`read_file\` tool to read "${args.file_path}" and locate the \`${args.function_name}\` function.`,
              `2. Use \`search_files\` to find all usages of \`${args.function_name}\` across the project to understand its call sites and dependencies.`,
              `3. Use \`search_files\` to find related test files that cover \`${args.function_name}\`.`,
              `4. Propose a refactored version that improves:`,
              `   - **Readability**: clear naming, reduced nesting, single responsibility`,
              `   - **Performance**: unnecessary allocations, redundant computations, algorithmic improvements`,
              `   - **Testability**: pure functions where possible, dependency injection, clear inputs/outputs`,
              `5. Ensure the refactored version:`,
              `   - Maintains the same public API (or documents breaking changes)`,
              `   - Passes all existing tests`,
              `   - Includes updated or new test cases if behavior changed`,
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
