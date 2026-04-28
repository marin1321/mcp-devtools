import { type ChildProcessByStdio, spawn } from "node:child_process";
import path from "node:path";
import type { Readable } from "node:stream";

import { z } from "zod";

import type { McpDevtoolsConfig } from "../../types/config.js";
import {
  CommandError,
  CommandNotAllowedError,
  ConfigError,
  ValidationError,
} from "../../types/errors.js";
import { type ToolResult, ok } from "../../types/tool-result.js";
import { assertWithinScope } from "../filesystem/_utils.js";

import {
  DEFAULT_TIMEOUT_MS,
  ENV_KEY_RE,
  KILL_GRACE_MS,
  MAX_OUTPUT_BYTES,
  SHELL_METACHARS,
} from "./_constants.js";

export const RunCommandInput = z.object({
  command: z.string().min(1).describe("Binary name (must be in allowedCommands)"),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export type RunCommandInput = z.infer<typeof RunCommandInput>;

export interface RunCommandOutput {
  exitCode: number;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  timedOut: boolean;
}

/**
 * Spawn an allowlisted command with hard caps on time and output, capturing
 * stdout/stderr separately. **Never** invokes a shell — `shell: false` is
 * the security pivot for this tool, and `args` are passed as a literal
 * array, so shell metacharacters in args are inert.
 *
 * Even though `shell: false` makes them harmless, we still reject `args`
 * containing shell metacharacters as a defensive contract: agents that
 * write `cmd | other` or `$(whoami)` are confused about the model and
 * should be told so explicitly. Chaining is deliberately not supported in
 * v1 — multiple `run_command` calls or a future scripting tool should
 * cover that.
 */
export async function runCommandHandler(
  input: RunCommandInput,
  config: McpDevtoolsConfig,
): Promise<ToolResult<RunCommandOutput>> {
  const allowed = config.allowedCommands;
  if (allowed.length === 0) {
    throw new ConfigError("run_command requires `allowedCommands` to be configured");
  }

  validateCommand(input.command, allowed);
  validateArgs(input.args);
  const env = buildEnv(input.env);
  const cwd = resolveCwd(input.cwd, config.scope);

  const timeoutMs = input.timeoutMs ?? config.commandTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  return runChild(input.command, input.args, { cwd, env, timeoutMs });
}

function validateCommand(command: string, allowed: readonly string[]): void {
  if (/\s/.test(command) || command.includes("/") || command.includes("\\")) {
    throw new ValidationError(
      "command must be a bare binary name (no whitespace or path separators)",
      { command },
    );
  }
  if (!allowed.includes(command)) {
    throw new CommandNotAllowedError(`Command '${command}' is not in allowedCommands`, {
      command,
      allowed: [...allowed],
    });
  }
}

function validateArgs(args: readonly string[]): void {
  for (const [i, a] of args.entries()) {
    if (SHELL_METACHARS.test(a)) {
      throw new ValidationError(
        "args must not contain shell metacharacters (;, |, &, `, $, >, <, newline)",
        { index: i, arg: a },
      );
    }
  }
}

function buildEnv(extra: Record<string, string> | undefined): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {};
  if (process.env.PATH !== undefined) base.PATH = process.env.PATH;
  if (process.env.HOME !== undefined) base.HOME = process.env.HOME;
  if (process.env.SystemRoot !== undefined) base.SystemRoot = process.env.SystemRoot;

  if (extra === undefined) return base;
  for (const [k, v] of Object.entries(extra)) {
    if (!ENV_KEY_RE.test(k)) {
      throw new ValidationError(`Invalid env variable name: ${k}`, { name: k });
    }
    base[k] = v;
  }
  return base;
}

function resolveCwd(input: string | undefined, scope: string): string {
  if (input === undefined) {
    return path.resolve(scope);
  }
  return assertWithinScope(scope, input);
}

interface RunOpts {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

function runChild(
  command: string,
  args: readonly string[],
  opts: RunOpts,
): Promise<ToolResult<RunCommandOutput>> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(command, [...args], {
        cwd: opts.cwd,
        env: opts.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(mapSpawnError(error, command));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;
    let exited = false;
    let sigtermSent = false;

    const killChain = (): void => {
      if (exited || sigtermSent) return;
      sigtermSent = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
      killTimer = setTimeout(() => {
        if (exited) return;
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }, KILL_GRACE_MS);
      killTimer.unref();
    };

    const captureStdout = (chunk: Buffer): void => {
      const remaining = MAX_OUTPUT_BYTES - stdoutBytes;
      if (remaining <= 0) {
        truncated = true;
        killChain();
        return;
      }
      if (chunk.length > remaining) {
        stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutBytes = MAX_OUTPUT_BYTES;
        truncated = true;
        killChain();
        return;
      }
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;
    };

    const captureStderr = (chunk: Buffer): void => {
      const remaining = MAX_OUTPUT_BYTES - stderrBytes;
      if (remaining <= 0) {
        truncated = true;
        killChain();
        return;
      }
      if (chunk.length > remaining) {
        stderrChunks.push(chunk.subarray(0, remaining));
        stderrBytes = MAX_OUTPUT_BYTES;
        truncated = true;
        killChain();
        return;
      }
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
    };

    child.stdout.on("data", captureStdout);
    child.stderr.on("data", captureStderr);

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      killChain();
    }, opts.timeoutMs);
    timeoutHandle.unref();

    child.on("error", (error) => {
      exited = true;
      clearTimeout(timeoutHandle);
      if (killTimer !== null) clearTimeout(killTimer);
      reject(mapSpawnError(error, command));
    });

    child.on("close", (code, signal) => {
      exited = true;
      clearTimeout(timeoutHandle);
      if (killTimer !== null) clearTimeout(killTimer);
      const out: RunCommandOutput = {
        exitCode: code ?? -1,
        signal: signal ?? null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        durationMs: Date.now() - startedAt,
        truncated,
        timedOut,
      };
      resolve(ok(out));
    });
  });
}

function mapSpawnError(error: unknown, command: string): CommandError {
  const e = error as NodeJS.ErrnoException;
  return new CommandError(`Failed to run '${command}': ${e.message ?? "unknown error"}`, {
    command,
    code: e.code ?? "UNKNOWN",
  });
}
