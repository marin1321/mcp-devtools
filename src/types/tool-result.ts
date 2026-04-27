/**
 * Discriminated union for tool execution results.
 *
 * Every tool handler must return a `ToolResult`. Failures are NEVER thrown;
 * they are returned as `{ ok: false, error }` so the MCP top-level handler
 * can map them to a typed protocol error response (RNF-03).
 */

export interface ToolResultOk<TData> {
  ok: true;
  data: TData;
  meta?: ToolResultMeta;
}

export interface ToolResultErr {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: ToolResultMeta;
}

export interface ToolResultMeta {
  durationMs?: number;
  truncated?: boolean;
  warnings?: string[];
}

export type ToolResult<TData = unknown> = ToolResultOk<TData> | ToolResultErr;

export function ok<TData>(data: TData, meta?: ToolResultMeta): ToolResultOk<TData> {
  return meta === undefined ? { ok: true, data } : { ok: true, data, meta };
}

export function err(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  meta?: ToolResultMeta,
): ToolResultErr {
  const error: ToolResultErr["error"] =
    details === undefined ? { code, message } : { code, message, details };
  return meta === undefined ? { ok: false, error } : { ok: false, error, meta };
}
