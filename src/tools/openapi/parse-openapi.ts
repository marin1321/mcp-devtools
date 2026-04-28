import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { loadSpec } from "./_spec-loader.js";

const MAX_OPERATIONS = 200;

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

export const ParseOpenApiInput = z.object({
  path: z.string().min(1),
});

export type ParseOpenApiInput = z.infer<typeof ParseOpenApiInput>;

export interface OperationSummary {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  tags?: string[];
}

export interface ParseOpenApiOutput {
  title: string;
  version: string;
  servers: string[];
  operations: OperationSummary[];
}

export async function parseOpenApiHandler(
  input: ParseOpenApiInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<ParseOpenApiOutput>> {
  const api = await loadSpec(input.path, config);

  const doc = api as unknown as Record<string, unknown>;
  const info = doc.info as { title?: string; version?: string } | undefined;
  const title = info?.title ?? "Untitled";
  const version = info?.version ?? "0.0.0";

  const servers = extractServers(doc);
  const operations = extractOperations(doc);

  return ok({ title, version, servers, operations });
}

function extractServers(api: Record<string, unknown>): string[] {
  // OpenAPI 3.x: servers[].url
  const servers = api.servers as Array<{ url?: string }> | undefined;
  if (Array.isArray(servers)) {
    return servers.map((s) => s.url).filter((u): u is string => typeof u === "string");
  }

  // Swagger 2.0: host + basePath + schemes
  const host = api.host as string | undefined;
  if (typeof host === "string") {
    const basePath = (api.basePath as string) ?? "";
    const schemes = (api.schemes as string[]) ?? ["https"];
    return schemes.map((scheme) => `${scheme}://${host}${basePath}`);
  }

  return [];
}

function extractOperations(api: Record<string, unknown>): OperationSummary[] {
  const paths = api.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const operations: OperationSummary[] = [];

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const [method, operationValue] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (!operationValue || typeof operationValue !== "object") continue;

      const op = operationValue as Record<string, unknown>;
      const operationId =
        typeof op.operationId === "string" ? op.operationId : `${method.toUpperCase()}_${pathStr}`;

      const summary: OperationSummary = {
        operationId,
        method: method.toUpperCase(),
        path: pathStr,
      };

      if (typeof op.summary === "string") {
        summary.summary = op.summary;
      }
      if (Array.isArray(op.tags) && op.tags.length > 0) {
        summary.tags = op.tags.filter((t): t is string => typeof t === "string");
      }

      operations.push(summary);

      if (operations.length >= MAX_OPERATIONS) {
        return operations;
      }
    }
  }

  return operations;
}
