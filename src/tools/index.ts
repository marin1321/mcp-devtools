/**
 * Tool registry barrel — single source of truth for tool exports.
 *
 * Adding a new tool:
 *   1. Implement the handler + schema in `src/tools/<group>/<name>.ts`
 *   2. Export it through this file
 *   3. Append a {@link defineTool} entry to `allTools` below
 *
 * `allTools` is the array consumed by `server.ts` at startup.
 */

import { defineTool, type ToolDefinition } from "../tool-registry.js";

import { DescribeTableInput, describeTableHandler } from "./database/describe-table.js";
import { ListTablesInput, listTablesHandler } from "./database/list-tables.js";
import { QueryDbInput, queryDbHandler } from "./database/query-db.js";
import { echoTestTool } from "./echo-test.js";
import { GetFileInfoInput, getFileInfoHandler } from "./filesystem/get-file-info.js";
import { ListDirectoryInput, listDirectoryHandler } from "./filesystem/list-directory.js";
import { ReadFileInput, readFileHandler } from "./filesystem/read-file.js";
import { SearchFilesInput, searchFilesHandler } from "./filesystem/search-files.js";
import { WriteFileInput, writeFileHandler } from "./filesystem/write-file.js";
import { CallApiInput, callApiHandler } from "./openapi/call-api.js";
import { ParseOpenApiInput, parseOpenApiHandler } from "./openapi/parse-openapi.js";
import { GetEnvInput, getEnvHandler } from "./process/get-env.js";
import { ReadLogsInput, readLogsHandler } from "./process/read-logs.js";
import { RunCommandInput, runCommandHandler } from "./process/run-command.js";

export * from "./echo-test.js";
export * from "./filesystem/read-file.js";
export * from "./filesystem/write-file.js";
export * from "./filesystem/list-directory.js";
export * from "./filesystem/search-files.js";
export * from "./filesystem/get-file-info.js";

export * from "./database/query-db.js";
export * from "./database/list-tables.js";
export * from "./database/describe-table.js";

export * from "./process/run-command.js";
export * from "./process/read-logs.js";
export * from "./process/get-env.js";

export * from "./openapi/parse-openapi.js";
export * from "./openapi/call-api.js";

export const allTools: readonly ToolDefinition[] = [
  echoTestTool,

  defineTool({
    name: "read_file",
    title: "Read file",
    description:
      "Read a text file inside the configured scope. Optionally restrict to a line range.",
    inputSchema: ReadFileInput,
    handler: readFileHandler,
  }),
  defineTool({
    name: "write_file",
    title: "Write file",
    description: "Write a file atomically inside the configured scope (writes to a temp file then renames).",
    inputSchema: WriteFileInput,
    handler: writeFileHandler,
  }),
  defineTool({
    name: "list_directory",
    title: "List directory",
    description:
      "List directory entries inside the configured scope, with optional recursion and glob filtering.",
    inputSchema: ListDirectoryInput,
    handler: listDirectoryHandler,
  }),
  defineTool({
    name: "search_files",
    title: "Search files",
    description: "Search for a pattern (literal or regex) across files inside the configured scope.",
    inputSchema: SearchFilesInput,
    handler: searchFilesHandler,
  }),
  defineTool({
    name: "get_file_info",
    title: "Get file info",
    description: "Return metadata (size, type, MIME, line count, symlink info) for a file or directory.",
    inputSchema: GetFileInfoInput,
    handler: getFileInfoHandler,
  }),

  defineTool({
    name: "query_db",
    title: "Query database",
    description:
      "Execute a parameterized SQL query against a configured database connection. Read-only by default.",
    inputSchema: QueryDbInput,
    handler: queryDbHandler,
  }),
  defineTool({
    name: "list_tables",
    title: "List tables",
    description: "List tables in a configured database connection.",
    inputSchema: ListTablesInput,
    handler: listTablesHandler,
  }),
  defineTool({
    name: "describe_table",
    title: "Describe table",
    description: "Return column metadata for a table in a configured database connection.",
    inputSchema: DescribeTableInput,
    handler: describeTableHandler,
  }),

  defineTool({
    name: "run_command",
    title: "Run command",
    description:
      "Spawn a process from the configured allowedCommands list. Captures stdout/stderr with caps and a timeout.",
    inputSchema: RunCommandInput,
    handler: runCommandHandler,
  }),
  defineTool({
    name: "read_logs",
    title: "Read logs",
    description: "Read the tail of a configured log file with optional filter.",
    inputSchema: ReadLogsInput,
    handler: readLogsHandler,
  }),
  defineTool({
    name: "get_env",
    title: "Get environment",
    description: "Return environment variables (process env or .env file) with optional masking.",
    inputSchema: GetEnvInput,
    handler: getEnvHandler,
  }),

  defineTool({
    name: "parse_openapi",
    title: "Parse OpenAPI",
    description: "Parse an OpenAPI spec and return a summary of operations.",
    inputSchema: ParseOpenApiInput,
    handler: parseOpenApiHandler,
  }),
  defineTool({
    name: "call_api",
    title: "Call API",
    description: "Invoke an operation defined in an OpenAPI spec.",
    inputSchema: CallApiInput,
    handler: callApiHandler,
  }),
];
