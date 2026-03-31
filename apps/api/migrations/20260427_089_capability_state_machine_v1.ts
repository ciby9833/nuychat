import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("skill_runs", (t) => {
    t.uuid("capability_id").references("capability_id").inTable("capabilities").onDelete("SET NULL");
  });

  await knex.schema.alterTable("skill_runs", (t) => {
    t.index(["tenant_id", "capability_id", "created_at"], "skill_runs_tenant_capability_idx");
  });

  await knex("skill_runs")
    .whereNull("capability_id")
    .whereNotNull("tenant_skill_id")
    .update({
      capability_id: knex.raw("tenant_skill_id")
    });

  await knex.schema.createTable("conversation_capability_states", (t) => {
    t.uuid("state_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("SET NULL");
    t.uuid("capability_id").notNullable().references("capability_id").inTable("capabilities").onDelete("CASCADE");
    t.string("status", 32).notNullable().defaultTo("clarifying");
    t.text("clarification_question");
    t.jsonb("missing_inputs").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    t.jsonb("resolved_inputs").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.text("last_user_message");
    t.timestamps(true, true);

    t.unique(["conversation_id"], "conversation_capability_states_conversation_uniq");
    t.index(["tenant_id", "status", "updated_at"], "conversation_capability_states_tenant_status_idx");
  });

  await knex.raw(`
    ALTER TABLE conversation_capability_states ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversation_capability_states FORCE ROW LEVEL SECURITY;
  `);
  await knex.raw(`
    CREATE POLICY conversation_capability_states_tenant_isolation ON conversation_capability_states
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
  await knex.raw(`
    CREATE TRIGGER conversation_capability_states_set_updated_at
    BEFORE UPDATE ON conversation_capability_states
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS conversation_capability_states_set_updated_at ON conversation_capability_states");
  await knex.raw("DROP POLICY IF EXISTS conversation_capability_states_tenant_isolation ON conversation_capability_states");
  await knex.schema.dropTableIfExists("conversation_capability_states");

  await knex.schema.alterTable("skill_runs", (t) => {
    t.dropIndex(["tenant_id", "capability_id", "created_at"], "skill_runs_tenant_capability_idx");
    t.dropColumn("capability_id");
  });
}
