import type { McpDevtoolsConfig } from "../../types/config.js";

import { type ConnectionPool, createConnectionPool } from "./connection-pool.js";

/**
 * Module-scoped pool cache shared by every database tool (query_db,
 * list_tables, describe_table).
 *
 * Per-call handlers don't own the connection lifetime — the pool does. We
 * cache one pool per loaded `databases` config object (identity, not deep
 * equality) so back-to-back tool calls reuse the same connections.
 *
 * On server shutdown the McpDevtoolsServer owns its own pool and tears it
 * down explicitly. This module-level cache is a transitional convenience
 * until handlers receive an explicit pool dependency (see task 13).
 */
let poolCache = new WeakMap<McpDevtoolsConfig["databases"], ConnectionPool>();

let poolFactoryOverride: ((config: McpDevtoolsConfig) => ConnectionPool) | null = null;

/**
 * Test-only injection seam. Pass `null` to restore the default factory.
 */
export function __setPoolFactoryForTests(
  factory: ((config: McpDevtoolsConfig) => ConnectionPool) | null,
): void {
  poolFactoryOverride = factory;
  poolCache = new WeakMap();
}

export function __resetPoolCacheForTests(): void {
  poolCache = new WeakMap();
}

export function getPool(config: McpDevtoolsConfig): ConnectionPool {
  if (poolFactoryOverride !== null) {
    return poolFactoryOverride(config);
  }
  let pool = poolCache.get(config.databases);
  if (pool === undefined) {
    pool = createConnectionPool(config.databases);
    poolCache.set(config.databases, pool);
  }
  return pool;
}
