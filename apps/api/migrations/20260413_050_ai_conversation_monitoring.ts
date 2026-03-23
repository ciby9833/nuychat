import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("queue_assignments", (t) => {
    t.uuid("assigned_ai_agent_id").references("ai_agent_id").inTable("tenant_ai_agents").onDelete("SET NULL");
    t.boolean("handoff_required").notNullable().defaultTo(false);
    t.text("handoff_reason");
    t.timestamp("last_ai_response_at", { useTz: true });
  });

  await knex.schema.alterTable("queue_assignments", (t) => {
    t.index(["tenant_id", "assigned_ai_agent_id", "status"], "queue_assignments_tenant_ai_status_idx");
  });

  await knex.schema.alterTable("conversations", (t) => {
    t.string("current_handler_type", 20);
    t.string("current_handler_id", 80);
  });

  await knex.schema.alterTable("conversations", (t) => {
    t.index(["tenant_id", "current_handler_type", "status"], "conversations_tenant_handler_status_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("conversations", (t) => {
    t.dropIndex(["tenant_id", "current_handler_type", "status"], "conversations_tenant_handler_status_idx");
    t.dropColumn("current_handler_id");
    t.dropColumn("current_handler_type");
  });

  await knex.schema.alterTable("queue_assignments", (t) => {
    t.dropIndex(["tenant_id", "assigned_ai_agent_id", "status"], "queue_assignments_tenant_ai_status_idx");
    t.dropColumn("last_ai_response_at");
    t.dropColumn("handoff_reason");
    t.dropColumn("handoff_required");
    t.dropColumn("assigned_ai_agent_id");
  });
}
