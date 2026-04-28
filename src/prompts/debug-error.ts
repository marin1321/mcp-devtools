import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDebugErrorPrompt(server: McpServer): void {
  server.registerPrompt(
    "debug_error",
    {
      description: "Systematically debug an error in your project using mcp-devtools tools",
      argsSchema: {
        error_message: z.string().describe("The error message or stack trace to debug"),
        file_path: z
          .string()
          .optional()
          .describe("Path to the file where the error occurs"),
      },
    },
    (args) => {
      const steps: string[] = [];

      if (args.file_path) {
        steps.push(
          `1. Use the \`read_file\` tool to read the file at "${args.file_path}" and examine the code around the error location.`,
        );
      } else {
        steps.push(
          "1. The user did not specify a file path. Use `search_files` to locate files related to the error.",
        );
      }

      steps.push(
        `2. Use the \`search_files\` tool to find code patterns, function definitions, or imports related to this error across the project.`,
        `3. Use the \`read_logs\` tool to check recent log entries for additional context, warnings, or preceding errors.`,
        `4. Synthesize your findings: identify the root cause, explain why the error occurs, and propose a concrete fix with code changes.`,
      );

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Debug the following error using mcp-devtools tools:\n`,
                `**Error:** ${args.error_message}\n`,
                ...(args.file_path ? [`**File:** ${args.file_path}\n`] : []),
                `Follow these steps:\n`,
                ...steps,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
