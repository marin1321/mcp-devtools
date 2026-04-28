import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { z } from "zod";

const execFileAsync = promisify(execFile);

import type { McpDevtoolsConfig } from "../../types/config.js";
import { type ToolResult, err, ok } from "../../types/tool-result.js";

export const ListProcessesInput = z.object({
  name: z.string().optional().describe("Filter processes by name substring (case-insensitive)"),
  port: z.number().int().positive().optional().describe("Filter by TCP listening port"),
  limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of results"),
});

export type ListProcessesInput = z.infer<typeof ListProcessesInput>;

export interface ProcessEntry {
  pid: number;
  name: string;
  command: string;
  cpu: string | undefined;
  memory: string | undefined;
  port: number | undefined;
}

export interface ListProcessesOutput {
  processes: ProcessEntry[];
  total: number;
  filtered: boolean;
}

export async function listProcessesHandler(
  input: ListProcessesInput,
  _config: McpDevtoolsConfig,
): Promise<ToolResult<ListProcessesOutput>> {
  let entries: ProcessEntry[];
  try {
    entries = await getProcessList();
  } catch {
    return err("COMMAND_ERROR", "Failed to retrieve process list");
  }

  const portMap = input.port !== undefined ? await getPortMap() : undefined;

  const filtered = input.name !== undefined || input.port !== undefined;

  if (input.port !== undefined && portMap !== undefined) {
    const pidsOnPort = portMap.get(input.port);
    if (pidsOnPort !== undefined) {
      entries = entries.filter((e) => pidsOnPort.has(e.pid));
      for (const entry of entries) {
        entry.port = input.port;
      }
    } else {
      entries = [];
    }
  } else if (input.port !== undefined) {
    entries = [];
  }

  if (input.name !== undefined) {
    const pattern = input.name.toLowerCase();
    entries = entries.filter(
      (e) => e.name.toLowerCase().includes(pattern) || e.command.toLowerCase().includes(pattern),
    );
  }

  const total = entries.length;
  entries = entries.slice(0, input.limit);

  return ok({ processes: entries, total, filtered });
}

function execFilePromise(command: string, args: string[]): Promise<{ stdout: string }> {
  return execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
}

function parsePsOutput(stdout: string): ProcessEntry[] {
  const lines = stdout.split("\n");
  if (lines.length < 2) return [];

  const entries: ProcessEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;

    // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    // First 10 fields are whitespace-separated; COMMAND (11th+) may contain spaces.
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) continue;

    const pid = Number.parseInt(parts[1]!, 10);
    if (Number.isNaN(pid)) continue;

    const cpu = parts[2]!;
    const mem = parts[3]!;
    const command = parts.slice(10).join(" ");
    const name = extractName(command);

    entries.push({ pid, name, command, cpu, memory: mem, port: undefined });
  }
  return entries;
}

function extractName(command: string): string {
  const firstToken = command.split(/\s+/)[0] ?? command;
  const segments = firstToken.split("/");
  return segments[segments.length - 1] ?? firstToken;
}

async function getProcessList(): Promise<ProcessEntry[]> {
  const { stdout } = await execFilePromise("ps", ["aux"]);
  return parsePsOutput(stdout);
}

/**
 * Build a map of port -> set of PIDs listening on that port.
 * Returns undefined on failure so the caller can degrade gracefully.
 */
async function getPortMap(): Promise<Map<number, Set<number>> | undefined> {
  if (process.platform === "darwin" || process.platform === "linux") {
    return getPortMapLsof();
  }
  return undefined;
}

async function getPortMapLsof(): Promise<Map<number, Set<number>> | undefined> {
  try {
    const { stdout } = await execFilePromise("lsof", ["-iTCP", "-sTCP:LISTEN", "-nP"]);
    return parseLsofOutput(stdout);
  } catch {
    if (process.platform === "linux") {
      return getPortMapSs();
    }
    return undefined;
  }
}

function parseLsofOutput(stdout: string): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  const lines = stdout.split("\n");

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;

    const pid = Number.parseInt(parts[1]!, 10);
    if (Number.isNaN(pid)) continue;

    // NAME column (last) has format like *:8080 or 127.0.0.1:3000
    const nameCol = parts[parts.length - 1]!;
    const portMatch = nameCol.match(/:(\d+)$/);
    if (!portMatch) continue;

    const port = Number.parseInt(portMatch[1]!, 10);
    if (Number.isNaN(port)) continue;

    let pids = map.get(port);
    if (pids === undefined) {
      pids = new Set<number>();
      map.set(port, pids);
    }
    pids.add(pid);
  }

  return map;
}

async function getPortMapSs(): Promise<Map<number, Set<number>> | undefined> {
  try {
    const { stdout } = await execFilePromise("ss", ["-tlnp"]);
    return parseSsOutput(stdout);
  } catch {
    return undefined;
  }
}

function parseSsOutput(stdout: string): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  const lines = stdout.split("\n");

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;

    // Local Address column has format like *:8080 or 0.0.0.0:3000
    const portMatch = line.match(/:(\d+)\s/);
    if (!portMatch) continue;

    const port = Number.parseInt(portMatch[1]!, 10);
    if (Number.isNaN(port)) continue;

    // PID is in users:(("name",pid=1234,...)) format
    const pidMatch = line.match(/pid=(\d+)/);
    if (!pidMatch) continue;

    const pid = Number.parseInt(pidMatch[1]!, 10);
    if (Number.isNaN(pid)) continue;

    let pids = map.get(port);
    if (pids === undefined) {
      pids = new Set<number>();
      map.set(port, pids);
    }
    pids.add(pid);
  }

  return map;
}
