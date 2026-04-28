import { resolve, isAbsolute } from "node:path";

import type { ToolDefinition } from "./tool-registry.js";
import { logger } from "./utils/logger.js";

interface PluginModule {
  default?: unknown;
}

function isToolDefinitionArray(value: unknown): value is ToolDefinition[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "name" in item &&
      typeof (item as ToolDefinition).name === "string" &&
      "description" in item &&
      typeof (item as ToolDefinition).description === "string" &&
      "inputSchema" in item &&
      "handler" in item &&
      typeof (item as ToolDefinition).handler === "function",
  );
}

/**
 * Dynamically load plugin modules and return their tool definitions.
 *
 * Each plugin must default-export an array of {@link ToolDefinition} objects.
 * Invalid or missing modules are skipped with a warning — a bad plugin never
 * crashes the server.
 */
export async function loadPlugins(
  pluginPaths: readonly string[],
  scopeRoot: string,
): Promise<ToolDefinition[]> {
  if (pluginPaths.length === 0) return [];

  const tools: ToolDefinition[] = [];

  for (const raw of pluginPaths) {
    try {
      const specifier = isAbsolute(raw) || raw.startsWith(".") ? resolve(scopeRoot, raw) : raw;

      const mod = (await import(specifier)) as PluginModule;
      const exported = mod.default;

      if (!isToolDefinitionArray(exported)) {
        logger.warn({ plugin: raw }, "plugin does not default-export a ToolDefinition[]; skipping");
        continue;
      }

      for (const tool of exported) {
        tools.push(tool);
        logger.info({ plugin: raw, tool: tool.name }, "loaded plugin tool");
      }
    } catch (error) {
      logger.warn({ plugin: raw, err: error }, "failed to load plugin; skipping");
    }
  }

  return tools;
}
