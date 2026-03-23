/**
 * Deprecated migration.
 *
 * This migration originally placed conversation waiting / auto-close settings
 * on `ai_configs`. That design has been superseded by SLA-based conversation
 * policy (`sla_policies.first_response_target_sec` and
 * `sla_policies.idle_close_after_sec`).
 *
 * The columns introduced here are removed by
 * `20260414_053_drop_ai_config_conversation_timeouts.ts` and are kept in
 * history only to preserve migration ordering for existing environments.
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_configs", (t) => {
    t.integer("idle_timeout_minutes")
      .nullable()
      .comment("Minutes of customer inactivity before auto-resolving; null = disabled");
    t.integer("frt_timeout_minutes")
      .nullable()
      .comment("Minutes to first agent response before FRT alert; null = disabled");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_configs", (t) => {
    t.dropColumn("frt_timeout_minutes");
    t.dropColumn("idle_timeout_minutes");
  });
}
