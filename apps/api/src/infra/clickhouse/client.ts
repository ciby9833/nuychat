/**
 * ClickHouse client — gracefully unavailable when ClickHouse is not running.
 *
 * When CLICKHOUSE_URL is not set or ClickHouse is unreachable all analytics
 * operations silently no-op (non-fatal).
 */

import { createClient, type ClickHouseClient } from "@clickhouse/client";

const CLICKHOUSE_ENABLED = process.env.CLICKHOUSE_ENABLED === "true";
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL;
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE ?? "nuychat";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER ?? "default";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "";

let _client: ClickHouseClient | null = null;
let _initialised = false;

export async function getClickhouseClient(): Promise<ClickHouseClient | null> {
  if (_initialised) return _client;
  _initialised = true;

  if (!CLICKHOUSE_ENABLED) {
    console.info("[ClickHouse] Disabled (set CLICKHOUSE_ENABLED=true to enable analytics storage)");
    _client = null;
    return _client;
  }

  if (!CLICKHOUSE_URL) {
    console.warn("[ClickHouse] CLICKHOUSE_URL missing while CLICKHOUSE_ENABLED=true — analytics disabled");
    _client = null;
    return _client;
  }

  try {
    const client = createClient({
      url: CLICKHOUSE_URL,
      username: CLICKHOUSE_USER,
      password: CLICKHOUSE_PASSWORD,
      database: CLICKHOUSE_DATABASE,
      clickhouse_settings: { async_insert: 1, wait_for_async_insert: 0 }
    });
    // Lightweight ping to verify connectivity
    await client.ping();
    _client = client;
    console.info(`[ClickHouse] Connected at ${CLICKHOUSE_URL}`);
  } catch {
    console.warn(`[ClickHouse] Not reachable at ${CLICKHOUSE_URL} — analytics disabled`);
    _client = null;
  }

  return _client;
}

/**
 * Create analytics tables if they don't already exist.
 * Called once at server startup; no-op when ClickHouse is unavailable.
 */
export async function initClickhouseTables(): Promise<void> {
  const client = await getClickhouseClient();
  if (!client) return;

  try {
    // Ensure the database exists
    await client.command({
      query: `CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE}`
    });

    // Main events table — all conversation analytics events land here
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_DATABASE}.conversation_events (
          event_id     UUID    DEFAULT generateUUIDv4(),
          tenant_id    String,
          conversation_id String,
          event_type   LowCardinality(String),
          payload      String  DEFAULT '{}',
          occurred_at  DateTime64(3) DEFAULT now64()
        ) ENGINE = MergeTree()
        ORDER BY (tenant_id, occurred_at)
        TTL toDateTime(occurred_at) + INTERVAL 365 DAY
      `
    });

    console.info("[ClickHouse] Tables initialised");
  } catch (err) {
    console.warn("[ClickHouse] Table init failed:", (err as Error).message);
  }
}
