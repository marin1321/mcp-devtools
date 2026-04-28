import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import type { AuditLogger } from "./audit.js";
import type { McpDevtoolsConfig } from "./types/config.js";
import { McpDevtoolsError } from "./types/errors.js";
import type { ToolResult } from "./types/tool-result.js";
import { logger } from "./utils/logger.js";

/**
 * Generic, type-erased tool definition stored in the registry.
 *
 * Use {@link defineTool} to construct one with full input/output typing
 * preserved at the call site.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: z.ZodObject<z.ZodRawShape>;
  readonly handler: (input: unknown, config: McpDevtoolsConfig) => Promise<ToolResult>;
}

/**
 * Builds a {@link ToolDefinition} while preserving type information for the
 * handler. The returned object is type-erased on storage; the helper exists
 * solely so the handler body sees `z.infer<typeof inputSchema>`.
 */
export function defineTool<TShape extends z.ZodRawShape, TOutput>(definition: {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodObject<TShape>;
  handler: (
    input: z.infer<z.ZodObject<TShape>>,
    config: McpDevtoolsConfig,
  ) => Promise<ToolResult<TOutput>>;
}): ToolDefinition {
  return definition as unknown as ToolDefinition;
}

/**
 * Maps a domain {@link ToolResult} to the MCP `CallToolResult` envelope.
 *
 * Both success and error paths populate `structuredContent` so well-behaved
 * clients can branch on machine-readable data, plus a human-readable `text`
 * block for clients that only render content arrays.
 */
export function toolResultToCallToolResult(result: ToolResult): CallToolResult {
  if (result.ok) {
    const data = result.data as Record<string, unknown> | undefined;
    return {
      structuredContent: data ?? {},
      content: [
        {
          type: "text",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }
  return {
    isError: true,
    structuredContent: {
      code: result.error.code,
      message: result.error.message,
      ...(result.error.details !== undefined ? { details: result.error.details } : {}),
    },
    content: [
      {
        type: "text",
        text: `[${result.error.code}] ${result.error.message}`,
      },
    ],
  };
}

/**
 * Last line of defense (RNF-03): translate a thrown error into a structured
 * MCP error response so the server keeps running. {@link McpDevtoolsError}
 * subclasses pass through with their stable `code`; anything else becomes
 * `INTERNAL_ERROR`.
 */
export function errorToCallToolResult(error: unknown, toolName: string): CallToolResult {
  if (error instanceof McpDevtoolsError) {
    logger.warn(
      { tool: toolName, code: error.code, err: error },
      "tool handler raised a domain error",
    );
    return {
      isError: true,
      structuredContent: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      content: [{ type: "text", text: `[${error.code}] ${error.message}` }],
    };
  }
  logger.error({ tool: toolName, err: error }, "unhandled error in tool handler");
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    structuredContent: {
      code: "INTERNAL_ERROR",
      message,
    },
    content: [{ type: "text", text: `[INTERNAL_ERROR] ${message}` }],
  };
}

/**
 * Registers a single tool with the MCP server, wrapping its handler with
 * input parsing, result mapping, and a top-level try/catch.
 */
export function registerTool(
  server: McpServer,
  definition: ToolDefinition,
  config: McpDevtoolsConfig,
  auditLogger?: AuditLogger,
): void {
  server.registerTool(
    definition.name,
    {
      ...(definition.title !== undefined ? { title: definition.title } : {}),
      description: definition.description,
      inputSchema: definition.inputSchema.shape,
    },
    async (rawInput: unknown): Promise<CallToolResult> => {
      const start = Date.now();
      try {
        const result = await definition.handler(rawInput, config);
        if (auditLogger) {
          const callToolResult = toolResultToCallToolResult(result);
          auditLogger.log({
            timestamp: new Date(start).toISOString(),
            tool: definition.name,
            inputSummary: rawInput,
            durationMs: Date.now() - start,
            ok: !callToolResult.isError,
            ...(callToolResult.isError
              ? {
                  errorCode:
                    (callToolResult.structuredContent as { code?: string } | undefined)?.code ??
                    "UNKNOWN",
                }
              : {}),
          });
        }
        return toolResultToCallToolResult(result);
      } catch (error) {
        if (auditLogger) {
          const code = error instanceof McpDevtoolsError ? error.code : "INTERNAL_ERROR";
          auditLogger.log({
            timestamp: new Date(start).toISOString(),
            tool: definition.name,
            inputSummary: rawInput,
            durationMs: Date.now() - start,
            ok: false,
            errorCode: code,
          });
        }
        return errorToCallToolResult(error, definition.name);
      }
    },
  );
}

/**
 * Registers every tool from the given list. Order does not matter; the SDK
 * tracks tools by name internally.
 */
export function registerAllTools(
  server: McpServer,
  tools: readonly ToolDefinition[],
  config: McpDevtoolsConfig,
  auditLogger?: AuditLogger,
): void {
  for (const tool of tools) {
    registerTool(server, tool, config, auditLogger);
    logger.debug({ tool: tool.name }, "registered tool");
  }
}
