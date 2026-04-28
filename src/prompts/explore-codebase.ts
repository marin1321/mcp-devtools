import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerExploreCodebasePrompt(server: McpServer): void {
  server.registerPrompt(
    "explore_codebase",
    {
      description: "Explore and understand a project's structure and conventions",
      argsSchema: {
        focus_area: z
          .string()
          .optional()
          .describe('Optional area to focus on (e.g., "database", "auth", "api")'),
      },
    },
    (args) => {
      const focusSteps: string[] = [];

      if (args.focus_area) {
        focusSteps.push(
          `3. Use \`search_files\` to find code related to "${args.focus_area}" — look for relevant modules, configuration, and patterns.`,
          `4. Use \`read_file\` on the most relevant files to understand the implementation details of the "${args.focus_area}" area.`,
        );
      } else {
        focusSteps.push(
          `3. Use \`search_files\` to identify key patterns: entry points, route definitions, middleware, and shared utilities.`,
        );
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Explore and document the project's structure and conventions using mcp-devtools tools.`,
                ...(args.focus_area ? [`\n**Focus area:** ${args.focus_area}`] : []),
                `\nFollow these steps:\n`,
                `1. Use the \`list_directory\` tool on the project root to understand the top-level structure (directories, config files, entry points).`,
                `2. Use \`read_file\` to examine key project files: README.md, package.json (or equivalent), and configuration files (tsconfig.json, .eslintrc, etc.).`,
                ...focusSteps,
                `\nSummarize your findings:`,
                `- **Project type**: language, framework, build system`,
                `- **Architecture**: directory layout, module organization, key abstractions`,
                `- **Conventions**: naming patterns, coding style, testing approach`,
                `- **Dependencies**: major libraries and their purpose`,
                ...(args.focus_area
                  ? [`- **${args.focus_area}**: detailed overview of this area's implementation`]
                  : []),
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
