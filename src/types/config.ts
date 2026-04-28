import { z } from "zod";

/**
 * Database connection configuration.
 *
 * `connectionString` may be a literal value or `env:VAR_NAME` to read from
 * `process.env`. This avoids embedding secrets in the config file.
 */
export const DatabaseConfigSchema = z.object({
  type: z.enum(["postgresql", "mysql", "sqlite"]),
  connectionString: z.string().min(1),
  readOnly: z.boolean().default(true),
  queryTimeoutMs: z.number().int().positive().default(10_000),
  maxRows: z.number().int().positive().default(200),
});

export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(false),
  path: z.string().default("./mcp-devtools-audit.ndjson"),
});

export const LogsConfigSchema = z.object({
  paths: z.array(z.string()).default([]),
  maxLines: z.number().int().positive().default(500),
});

export const AuthConfigSchema = z.object({
  token: z.string().optional(),
});

export const TransportSchema = z.enum(["stdio", "http"]);

/**
 * Top-level configuration schema for `mcp-devtools`.
 *
 * Loaded by cosmiconfig from any of:
 *   - `mcp-devtools.json`
 *   - `.mcp-devtools.json` / `.mcp-devtools.yaml`
 *   - `package.json` `"mcpDevtools"` key
 */
export const McpDevtoolsConfigSchema = z.object({
  scope: z.string().default("./"),
  allowedCommands: z.array(z.string()).default(["npm", "node", "python", "git", "make"]),
  commandTimeoutMs: z.number().int().positive().default(30_000),
  commandOutputMaxBytes: z
    .number()
    .int()
    .positive()
    .default(100 * 1024),
  databases: z.record(z.string(), DatabaseConfigSchema).default({}),
  logs: LogsConfigSchema.default({ paths: [], maxLines: 500 }),
  transport: TransportSchema.default("stdio"),
  port: z.number().int().min(1).max(65_535).default(3333),
  debug: z.boolean().default(false),
  plugins: z.array(z.string()).default([]),
  audit: AuditConfigSchema.default({ enabled: false, path: "./mcp-devtools-audit.ndjson" }),
  auth: AuthConfigSchema.default({}),
});

export type AuditConfig = z.infer<typeof AuditConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type LogsConfig = z.infer<typeof LogsConfigSchema>;
export type Transport = z.infer<typeof TransportSchema>;
export type McpDevtoolsConfig = z.infer<typeof McpDevtoolsConfigSchema>;
