import { cosmiconfig } from "cosmiconfig";

import { type McpDevtoolsConfig, McpDevtoolsConfigSchema } from "./types/config.js";
import { ConfigError } from "./types/errors.js";
import { logger } from "./utils/logger.js";

const MODULE_NAME = "mcp-devtools";

/**
 * Load and validate config via cosmiconfig (RF-05).
 *
 * Search order:
 *   1. `MCP_DEVTOOLS_CONFIG` env var (explicit path)
 *   2. `mcp-devtools.json` / `.mcp-devtools.{json,yaml,yml,js,cjs,mjs}`
 *   3. `package.json` `"mcpDevtools"` key
 *
 * Falls back to schema defaults when no file is found (RNF-05: zero config).
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<McpDevtoolsConfig> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      "package.json",
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.json`,
      `.${MODULE_NAME}rc.yaml`,
      `.${MODULE_NAME}rc.yml`,
      `.${MODULE_NAME}rc.js`,
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.json`,
    ],
    packageProp: "mcpDevtools",
  });

  const explicit = process.env["MCP_DEVTOOLS_CONFIG"];
  const result = explicit ? await explorer.load(explicit) : await explorer.search(cwd);

  const raw: unknown = result?.config ?? {};
  const parsed = McpDevtoolsConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError("Invalid mcp-devtools configuration", {
      issues: parsed.error.issues,
      filepath: result?.filepath,
    });
  }

  logger.debug({ filepath: result?.filepath ?? "<defaults>" }, "config loaded");
  return parsed.data;
}
