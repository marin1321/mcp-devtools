import { z } from "zod";

import { defineTool } from "../tool-registry.js";
import { type ToolResult, ok } from "../types/tool-result.js";

/**
 * Debug tool used to validate the MCP transport + registry pipeline end to
 * end without depending on any other subsystem (filesystem, DB, child
 * processes). Returns the input message echoed back with a server-side
 * timestamp.
 *
 * This tool is intentionally trivial. A future phase may hide it behind a
 * `debug: true` config flag; for v1 it ships always-on so contributors and
 * users can verify their wiring.
 */
export const EchoTestInputSchema = z.object({
  message: z.string().min(1).max(1024).describe("Arbitrary string the server will echo back"),
});

export type EchoTestInput = z.infer<typeof EchoTestInputSchema>;

export interface EchoTestOutput {
  message: string;
  receivedAt: string;
}

export async function echoTestHandler(input: EchoTestInput): Promise<ToolResult<EchoTestOutput>> {
  return Promise.resolve(
    ok({
      message: input.message,
      receivedAt: new Date().toISOString(),
    }),
  );
}

export const echoTestTool = defineTool({
  name: "echo_test",
  title: "Echo test",
  description:
    "Returns the provided message and a server-side ISO timestamp. " +
    "Used to verify the MCP server pipeline end-to-end.",
  inputSchema: EchoTestInputSchema,
  handler: echoTestHandler,
});
