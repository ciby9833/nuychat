import type { Knex } from "knex";

/**
 * Adds last_seen_at to agent_profiles for presence/heartbeat tracking.
 * The agent workspace pings POST /api/agent/heartbeat every 30 seconds.
 *
 * Effective status is computed at read-time:
 *   - last_seen_at > now - 5min  → use stored status
 *   - last_seen_at > now - 30min → effective "away"
 *   - last_seen_at null or older  → effective "offline"
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_profiles", (t) => {
    t.timestamp("last_seen_at", { useTz: true });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_profiles", (t) => {
    t.dropColumn("last_seen_at");
  });
}
