import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCodeReviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "code_review",
    {
      description: "Review a file for bugs, security issues, and code quality",
      argsSchema: {
        file_path: z.string().describe("Path to the file to review"),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Perform a thorough code review of "${args.file_path}" using mcp-devtools tools.\n`,
              `Follow these steps:\n`,
              `1. Use the \`read_file\` tool to read the contents of "${args.file_path}".`,
              `2. Analyze the code for:`,
              `   - **Bugs**: logic errors, off-by-one errors, null/undefined handling, race conditions`,
              `   - **Security**: input validation, injection vulnerabilities, sensitive data exposure, insecure defaults`,
              `   - **Error handling**: missing try/catch blocks, unhandled promise rejections, swallowed errors`,
              `   - **Code quality**: readability, naming conventions, code duplication, complexity`,
              `3. Use \`search_files\` to find related test files (e.g., matching \`*.test.*\` or \`*.spec.*\` patterns) and assess test coverage.`,
              `4. Provide structured feedback with:`,
              `   - A severity level for each finding (critical / warning / suggestion)`,
              `   - The specific line or code section affected`,
              `   - A recommended fix or improvement`,
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
