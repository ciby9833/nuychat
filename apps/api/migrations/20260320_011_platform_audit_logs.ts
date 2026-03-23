import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_audit_logs", (t) => {
    t.uuid("audit_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("actor_identity_id").notNullable().references("identity_id").inTable("identities").onDelete("RESTRICT");
    t.string("action", 120).notNullable();
    t.string("target_type", 60).notNullable();
    t.string("target_id", 120);
    t.string("status", 20).notNullable().defaultTo("success");
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.string("request_ip", 80);
    t.string("user_agent", 300);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["actor_identity_id", "created_at"], "platform_audit_logs_actor_idx");
    t.index(["action", "created_at"], "platform_audit_logs_action_idx");
    t.index(["target_type", "target_id"], "platform_audit_logs_target_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_audit_logs");
}
