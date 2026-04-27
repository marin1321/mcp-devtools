import { config as loadDotenv } from "dotenv";

import { loadConfig } from "./config.js";
import { McpDevtoolsServer } from "./server.js";
import { McpDevtoolsError } from "./types/errors.js";
import { logger } from "./utils/logger.js";

loadDotenv({ quiet: true });

export { McpDevtoolsServer } from "./server.js";
export { loadConfig } from "./config.js";
export * from "./types/index.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const server = new McpDevtoolsServer(config);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "received shutdown signal");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error({ err: error }, "uncaught exception");
    process.exit(1);
  });
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error({ err: reason }, "unhandled rejection");
    process.exit(1);
  });

  await server.start();
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("mcp-devtools") === true ||
  process.argv[1]?.endsWith("dist/index.js") === true ||
  process.argv[1]?.endsWith("dist/index.cjs") === true;

if (isDirectInvocation) {
  main().catch((error: unknown) => {
    if (error instanceof McpDevtoolsError) {
      logger.error({ code: error.code, details: error.details }, error.message);
    } else {
      logger.error({ err: error }, "fatal error during startup");
    }
    process.exit(1);
  });
}
