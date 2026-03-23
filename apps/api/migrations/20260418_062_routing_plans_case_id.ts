import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("routing_plans", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.index(["tenant_id", "case_id", "created_at"], "routing_plans_tenant_case_created_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("routing_plans", (t) => {
    t.dropIndex(["tenant_id", "case_id", "created_at"], "routing_plans_tenant_case_created_idx");
    t.dropColumn("case_id");
  });
}
