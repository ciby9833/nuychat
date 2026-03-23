import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const installsExists = await knex.schema.hasTable("marketplace_skill_installs");
  if (installsExists) {
    const hasRequiresApproval = await knex.schema.hasColumn("marketplace_skill_installs", "requires_human_approval");
    const hasApprovalScope = await knex.schema.hasColumn("marketplace_skill_installs", "approval_scope");

    await knex.schema.alterTable("marketplace_skill_installs", (t) => {
      if (hasApprovalScope) t.dropColumn("approval_scope");
      if (hasRequiresApproval) t.dropColumn("requires_human_approval");
    });
  }

  const approvalsExists = await knex.schema.hasTable("skill_execution_approvals");
  if (approvalsExists) {
    await knex.raw("DROP TRIGGER IF EXISTS skill_execution_approvals_set_updated_at ON skill_execution_approvals");
    await knex.raw("DROP POLICY IF EXISTS skill_execution_approvals_tenant_isolation ON skill_execution_approvals");
    await knex.schema.dropTable("skill_execution_approvals");
  }

  await knex("marketplace_skills")
    .where({ slug: "order-skill" })
    .update({
      manifest: knex.raw("jsonb_set(COALESCE(manifest, '{}'::jsonb), '{toolName}', to_jsonb(?::text), true)", ["lookup_order"])
    });
  await knex("marketplace_skills")
    .where({ slug: "logistics-skill" })
    .update({
      manifest: knex.raw("jsonb_set(COALESCE(manifest, '{}'::jsonb), '{toolName}', to_jsonb(?::text), true)", ["track_shipment"])
    });
  await knex("marketplace_skills")
    .where({ slug: "knowledge-base-skill" })
    .update({
      manifest: knex.raw("jsonb_set(COALESCE(manifest, '{}'::jsonb), '{toolName}', to_jsonb(?::text), true)", ["search_knowledge_base"])
    });
  await knex("marketplace_skills")
    .where({ slug: "crm-skill" })
    .update({
      manifest: knex.raw("jsonb_set(COALESCE(manifest, '{}'::jsonb), '{toolName}', to_jsonb(?::text), true)", ["get_customer_info"])
    });
}

export async function down(knex: Knex): Promise<void> {
  const installsExists = await knex.schema.hasTable("marketplace_skill_installs");
  if (installsExists) {
    await knex.schema.alterTable("marketplace_skill_installs", (t) => {
      t.boolean("requires_human_approval").notNullable().defaultTo(false);
      t.string("approval_scope", 20).notNullable().defaultTo("ai_only");
    });
  }

  const approvalsExists = await knex.schema.hasTable("skill_execution_approvals");
  if (!approvalsExists) {
    await knex.schema.createTable("skill_execution_approvals", (t) => {
      t.uuid("approval_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
      t.uuid("install_id").notNullable().references("install_id").inTable("marketplace_skill_installs").onDelete("CASCADE");
      t.string("skill_name", 120).notNullable();
      t.string("request_hash", 128).notNullable();
      t.string("requested_by_type", 20).notNullable().defaultTo("ai");
      t.uuid("requested_by_id").references("identity_id").inTable("identities").onDelete("SET NULL");
      t.string("status", 20).notNullable().defaultTo("pending");
      t.jsonb("request_payload").notNullable().defaultTo("{}");
      t.jsonb("decision_payload").notNullable().defaultTo("{}");
      t.timestamp("decided_at", { useTz: true });
      t.timestamp("executed_at", { useTz: true });
      t.timestamps(true, true);
    });
  }
}
