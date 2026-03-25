import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("tenant_ai_runtime_policies");
  if (!exists) {
    await knex.schema.createTable("tenant_ai_runtime_policies", (t) => {
      t.uuid("policy_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.jsonb("pre_reply_policies").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.unique(["tenant_id"], "tenant_ai_runtime_policies_tenant_uniq");
      t.index(["tenant_id"], "tenant_ai_runtime_policies_tenant_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tenant_ai_runtime_policies");
}
