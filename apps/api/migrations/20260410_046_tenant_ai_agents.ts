import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tenant_ai_agents", (t) => {
    t.uuid("ai_agent_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("name", 160).notNullable();
    t.text("description");
    t.string("status", 20).notNullable().defaultTo("draft");
    t.timestamps(true, true);

    t.index(["tenant_id", "status"], "idx_tenant_ai_agents_tenant_status");
  });

  await knex.raw(`
    ALTER TABLE tenant_ai_agents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_ai_agents FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_ai_agents_tenant_isolation ON tenant_ai_agents
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP POLICY IF EXISTS tenant_ai_agents_tenant_isolation ON tenant_ai_agents");
  await knex.schema.dropTableIfExists("tenant_ai_agents");
}
