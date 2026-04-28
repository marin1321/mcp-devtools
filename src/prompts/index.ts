import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerCodeReviewPrompt } from "./code-review.js";
import { registerDebugErrorPrompt } from "./debug-error.js";
import { registerExploreCodebasePrompt } from "./explore-codebase.js";
import { registerRefactorFunctionPrompt } from "./refactor-function.js";

export function registerAllPrompts(server: McpServer): void {
  registerDebugErrorPrompt(server);
  registerCodeReviewPrompt(server);
  registerExploreCodebasePrompt(server);
  registerRefactorFunctionPrompt(server);
}
