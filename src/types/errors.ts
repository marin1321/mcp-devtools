/**
 * Domain error taxonomy. Maps to typed MCP error responses (RF-06).
 *
 * Each subclass carries a stable `code` so clients can branch on it without
 * parsing the message. Codes are namespaced by domain.
 */

export abstract class McpDevtoolsError extends Error {
  public abstract readonly code: string;

  public readonly details: Record<string, unknown> | undefined;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ConfigError extends McpDevtoolsError {
  public readonly code = "CONFIG_ERROR";
}

export class ScopeViolationError extends McpDevtoolsError {
  public readonly code = "SCOPE_VIOLATION";
}

export class FileSystemError extends McpDevtoolsError {
  public readonly code = "FILESYSTEM_ERROR";
}

export class DatabaseError extends McpDevtoolsError {
  public readonly code = "DATABASE_ERROR";
}

export class ReadOnlyViolationError extends McpDevtoolsError {
  public readonly code = "DATABASE_READONLY_VIOLATION";
}

export class CommandError extends McpDevtoolsError {
  public readonly code = "COMMAND_ERROR";
}

export class CommandNotAllowedError extends McpDevtoolsError {
  public readonly code = "COMMAND_NOT_ALLOWED";
}

export class TimeoutError extends McpDevtoolsError {
  public readonly code = "TIMEOUT";
}

export class ValidationError extends McpDevtoolsError {
  public readonly code = "VALIDATION_ERROR";
}
