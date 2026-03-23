import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const installTableExists = await knex.schema.hasTable("marketplace_skill_installs");
  if (installTableExists) {
    await knex.schema.alterTable("marketplace_skill_installs", (t) => {
      t.boolean("requires_human_approval").notNullable().defaultTo(false);
      t.string("approval_scope", 20).notNullable().defaultTo("ai_only");
    });
  }

  await knex.schema.createTable("skill_execution_approvals", (t) => {
    t.uuid("approval_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("install_id").notNullable().references("install_id").inTable("marketplace_skill_installs").onDelete("CASCADE");
    t.string("skill_name", 120).notNullable();
    t.string("request_hash", 128).notNullable();
    t.string("requested_by_type", 20).notNullable().defaultTo("ai"); // ai | agent | workflow
    t.uuid("requested_by_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.string("status", 20).notNullable().defaultTo("pending"); // pending | approved | rejected | executed | cancelled
    t.jsonb("request_payload").notNullable().defaultTo("{}");
    t.jsonb("decision_payload").notNullable().defaultTo("{}");
    t.timestamp("decided_at", { useTz: true });
    t.timestamp("executed_at", { useTz: true });
    t.timestamps(true, true);

    t.index(["tenant_id", "status", "created_at"], "skill_execution_approvals_tenant_status_idx");
    t.index(["tenant_id", "conversation_id", "created_at"], "skill_execution_approvals_conversation_idx");
    t.index(["tenant_id", "install_id", "request_hash"], "skill_execution_approvals_install_hash_idx");
  });

  await knex.raw(`
    ALTER TABLE skill_execution_approvals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE skill_execution_approvals FORCE ROW LEVEL SECURITY;
    CREATE POLICY skill_execution_approvals_tenant_isolation ON skill_execution_approvals
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER skill_execution_approvals_set_updated_at
    BEFORE UPDATE ON skill_execution_approvals
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS skill_execution_approvals_set_updated_at ON skill_execution_approvals");
  await knex.raw("DROP POLICY IF EXISTS skill_execution_approvals_tenant_isolation ON skill_execution_approvals");
  await knex.schema.dropTableIfExists("skill_execution_approvals");

  const installTableExists = await knex.schema.hasTable("marketplace_skill_installs");
  if (installTableExists) {
    await knex.schema.alterTable("marketplace_skill_installs", (t) => {
      t.dropColumn("approval_scope");
      t.dropColumn("requires_human_approval");
    });
  }
}
