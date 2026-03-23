import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_profiles", (t) => {
    t.timestamp("last_heartbeat_at", { useTz: true });
    t.timestamp("last_activity_at", { useTz: true });
    t.string("presence_state", 20).notNullable().defaultTo("offline");
    t.timestamp("presence_state_changed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("presence_recovery_due_at", { useTz: true });
    t.index(["tenant_id", "presence_state"], "agent_profiles_tenant_presence_state_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_profiles", (t) => {
    t.dropIndex(["tenant_id", "presence_state"], "agent_profiles_tenant_presence_state_idx");
    t.dropColumn("presence_recovery_due_at");
    t.dropColumn("presence_state_changed_at");
    t.dropColumn("presence_state");
    t.dropColumn("last_activity_at");
    t.dropColumn("last_heartbeat_at");
  });
}
