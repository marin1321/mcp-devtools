import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import { CommandError, TimeoutError, ValidationError } from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";

import { loadSpec } from "./_spec-loader.js";

export const CallApiInput = z.object({
  specPath: z.string().min(1),
  operationId: z.string().min(1),
  pathParams: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).default({}),
});

export type CallApiInput = z.infer<typeof CallApiInput>;

export interface CallApiOutput {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

const MAX_RESPONSE_BYTES = 100 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = "http://localhost:3000";

interface OperationMatch {
  method: string;
  pathTemplate: string;
  operation: { operationId?: string };
}

/**
 * Finds an operation in the spec by `operationId`, iterating over all paths
 * and HTTP methods.
 */
function findOperation(
  spec: { paths?: Record<string, Record<string, unknown>> },
  operationId: string,
): OperationMatch {
  const httpMethods = new Set([
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace",
  ]);

  if (spec.paths) {
    for (const [pathTemplate, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem || typeof pathItem !== "object") continue;
      for (const [method, op] of Object.entries(pathItem)) {
        if (!httpMethods.has(method)) continue;
        const operation = op as { operationId?: string } | undefined;
        if (operation?.operationId === operationId) {
          return { method, pathTemplate, operation };
        }
      }
    }
  }

  throw new ValidationError(`Operation not found: ${operationId}`, { operationId });
}

/**
 * Extracts the list of allowed hosts from the spec's `servers` array.
 * Falls back to localhost if no servers are declared.
 */
function getAllowedHosts(spec: { servers?: Array<{ url: string }> }): Set<string> {
  const hosts = new Set<string>();

  if (spec.servers && spec.servers.length > 0) {
    for (const server of spec.servers) {
      try {
        const url = new URL(server.url);
        hosts.add(url.hostname);
      } catch {
        // relative or invalid URL — skip
      }
    }
  }

  if (hosts.size === 0) {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }

  return hosts;
}

/**
 * Substitutes path parameters in a template like `/users/{id}`.
 */
function buildPath(template: string, params: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, encodeURIComponent(value));
  }
  return result;
}

/**
 * Builds the full URL from base, path template, path params, and query params.
 * Concatenates the base server URL path with the operation path instead of
 * using URL resolution (which would drop the base path for absolute paths).
 */
function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, string | number | boolean>,
): URL {
  const resolvedPath = buildPath(pathTemplate, pathParams);

  const base = baseUrl.startsWith("/") ? `${DEFAULT_BASE_URL}${baseUrl}` : baseUrl;
  const parsed = new URL(base);
  const basePath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = `${basePath}${resolvedPath}`;

  for (const [key, value] of Object.entries(queryParams)) {
    parsed.searchParams.set(key, String(value));
  }

  return parsed;
}

/**
 * Converts response headers to a flat string record.
 */
function flattenHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Reads the response body, capping at MAX_RESPONSE_BYTES.
 * Tries JSON parsing, falls back to text.
 */
async function readResponseBody(
  response: Response,
): Promise<{ body: unknown; truncated: boolean }> {
  const buffer = await response.arrayBuffer();
  const truncated = buffer.byteLength > MAX_RESPONSE_BYTES;
  const slice = truncated ? buffer.slice(0, MAX_RESPONSE_BYTES) : buffer;
  const text = new TextDecoder().decode(slice);

  try {
    return { body: JSON.parse(text), truncated };
  } catch {
    return { body: text, truncated };
  }
}

export async function callApiHandler(
  input: CallApiInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<CallApiOutput>> {
  const spec = await loadSpec(input.specPath, config);

  const { method, pathTemplate } = findOperation(
    spec as unknown as { paths?: Record<string, Record<string, unknown>> },
    input.operationId,
  );

  const servers = (spec as unknown as { servers?: Array<{ url: string }> }).servers;
  const baseUrl = servers && servers.length > 0 ? servers[0]!.url : DEFAULT_BASE_URL;

  const url = buildUrl(baseUrl, pathTemplate, input.pathParams, input.queryParams);

  const allowedHosts = getAllowedHosts(spec as unknown as { servers?: Array<{ url: string }> });
  if (!allowedHosts.has(url.hostname)) {
    throw new ValidationError(`Host "${url.hostname}" is not in the spec's servers list`, {
      hostname: url.hostname,
      allowed: [...allowedHosts],
    });
  }

  const requestHeaders: Record<string, string> = { ...input.headers };
  const hasBody = method !== "get" && method !== "head" && input.body !== undefined;

  if (hasBody && !requestHeaders["content-type"] && !requestHeaders["Content-Type"]) {
    requestHeaders["content-type"] = "application/json";
  }

  const start = performance.now();

  let response: Response;
  try {
    const init: RequestInit = {
      method: method.toUpperCase(),
      headers: requestHeaders,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    };
    if (hasBody) {
      init.body = JSON.stringify(input.body);
    }
    response = await fetch(url.toString(), init);
  } catch (error) {
    const err = error as Error;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new TimeoutError(`Request timed out after ${DEFAULT_TIMEOUT_MS}ms`, {
        url: url.toString(),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
    }
    throw new CommandError(`HTTP request failed: ${err.message}`, {
      url: url.toString(),
    });
  }

  const durationMs = Math.round(performance.now() - start);
  const { body, truncated } = await readResponseBody(response);

  return ok(
    {
      status: response.status,
      headers: flattenHeaders(response.headers),
      body,
      durationMs,
    },
    truncated ? { truncated: true, warnings: ["Response body truncated to 100KB"] } : undefined,
  );
}
