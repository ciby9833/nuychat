import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasDefinitions = await knex.schema.hasTable("sla_definitions");
  if (!hasDefinitions) {
    await knex.schema.createTable("sla_definitions", (t) => {
      t.uuid("definition_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.string("name", 120).notNullable();
      t.string("priority", 30).notNullable().defaultTo("standard");
      t.integer("first_response_target_sec").notNullable();
      t.integer("assignment_accept_target_sec");
      t.integer("follow_up_target_sec");
      t.integer("resolution_target_sec").notNullable();
      t.jsonb("conditions").notNullable().defaultTo("{}");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.uuid("legacy_policy_id");
      t.timestamps(true, true);
      t.unique(["tenant_id", "name"], "sla_definitions_tenant_name_uniq");
      t.index(["tenant_id", "is_active"], "sla_definitions_tenant_active_idx");
      t.index(["tenant_id", "priority"], "sla_definitions_tenant_priority_idx");
    });
    await enableTenantRls(knex, "sla_definitions");
  }

  const hasTriggerPolicies = await knex.schema.hasTable("sla_trigger_policies");
  if (!hasTriggerPolicies) {
    await knex.schema.createTable("sla_trigger_policies", (t) => {
      t.uuid("trigger_policy_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.string("name", 120).notNullable();
      t.string("priority", 30).notNullable().defaultTo("standard");
      t.jsonb("first_response_actions").notNullable().defaultTo("[]");
      t.jsonb("assignment_accept_actions").notNullable().defaultTo("[]");
      t.jsonb("follow_up_actions").notNullable().defaultTo("[]");
      t.jsonb("resolution_actions").notNullable().defaultTo("[]");
      t.jsonb("conditions").notNullable().defaultTo("{}");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.uuid("legacy_policy_id");
      t.timestamps(true, true);
      t.unique(["tenant_id", "name"], "sla_trigger_policies_tenant_name_uniq");
      t.index(["tenant_id", "is_active"], "sla_trigger_policies_tenant_active_idx");
      t.index(["tenant_id", "priority"], "sla_trigger_policies_tenant_priority_idx");
    });
    await enableTenantRls(knex, "sla_trigger_policies");
  }

  await knex.schema.alterTable("sla_breaches", (t) => {
    if (!("definition_id" in t)) t.uuid("definition_id").references("definition_id").inTable("sla_definitions").onDelete("SET NULL");
    if (!("trigger_policy_id" in t)) t.uuid("trigger_policy_id").references("trigger_policy_id").inTable("sla_trigger_policies").onDelete("SET NULL");
  }).catch(async () => {
    if (!(await knex.schema.hasColumn("sla_breaches", "definition_id"))) {
      await knex.schema.alterTable("sla_breaches", (t) => {
        t.uuid("definition_id").references("definition_id").inTable("sla_definitions").onDelete("SET NULL");
      });
    }
    if (!(await knex.schema.hasColumn("sla_breaches", "trigger_policy_id"))) {
      await knex.schema.alterTable("sla_breaches", (t) => {
        t.uuid("trigger_policy_id").references("trigger_policy_id").inTable("sla_trigger_policies").onDelete("SET NULL");
      });
    }
  });

  await knex.raw("CREATE INDEX IF NOT EXISTS sla_breaches_tenant_definition_created_idx ON sla_breaches (tenant_id, definition_id, created_at)");
  await knex.raw("CREATE INDEX IF NOT EXISTS sla_breaches_tenant_trigger_created_idx ON sla_breaches (tenant_id, trigger_policy_id, created_at)");

  const hasLegacyPolicies = await knex.schema.hasTable("sla_policies");
  if (hasLegacyPolicies) {
    await knex.raw(`
      INSERT INTO sla_definitions (
        definition_id,
        tenant_id,
        name,
        priority,
        first_response_target_sec,
        assignment_accept_target_sec,
        follow_up_target_sec,
        resolution_target_sec,
        conditions,
        is_active,
        legacy_policy_id,
        created_at,
        updated_at
      )
      SELECT
        uuid_generate_v4(),
        p.tenant_id,
        p.name,
        p.priority,
        p.first_response_target_sec,
        p.assignment_reassign_after_sec,
        COALESCE(p.waiting_customer_close_after_sec, p.semantic_close_grace_sec),
        p.resolution_target_sec,
        COALESCE(p.conditions, '{}'::jsonb),
        p.is_active,
        p.policy_id,
        p.created_at,
        p.updated_at
      FROM sla_policies p
      WHERE NOT EXISTS (
        SELECT 1 FROM sla_definitions d WHERE d.legacy_policy_id = p.policy_id
      )
    `);

    await knex.raw(`
      INSERT INTO sla_trigger_policies (
        trigger_policy_id,
        tenant_id,
        name,
        priority,
        first_response_actions,
        assignment_accept_actions,
        follow_up_actions,
        resolution_actions,
        conditions,
        is_active,
        legacy_policy_id,
        created_at,
        updated_at
      )
      SELECT
        uuid_generate_v4(),
        p.tenant_id,
        p.name,
        p.priority,
        '[{"type":"alert"}]'::jsonb,
        CASE
          WHEN p.assignment_reassign_after_sec IS NOT NULL THEN '[{"type":"alert"},{"type":"reassign"}]'::jsonb
          ELSE '[{"type":"alert"}]'::jsonb
        END,
        CASE
          WHEN p.waiting_customer_close_after_sec IS NOT NULL THEN '[{"type":"close_case","mode":"waiting_customer"}]'::jsonb
          WHEN p.semantic_close_grace_sec IS NOT NULL THEN '[{"type":"close_case","mode":"semantic"}]'::jsonb
          ELSE '[{"type":"alert"}]'::jsonb
        END,
        CASE
          WHEN COALESCE(p.escalation_after_sec, 0) > 0 THEN '[{"type":"alert"},{"type":"escalate"}]'::jsonb
          ELSE '[{"type":"alert"}]'::jsonb
        END,
        COALESCE(p.conditions, '{}'::jsonb),
        p.is_active,
        p.policy_id,
        p.created_at,
        p.updated_at
      FROM sla_policies p
      WHERE NOT EXISTS (
        SELECT 1 FROM sla_trigger_policies tp WHERE tp.legacy_policy_id = p.policy_id
      )
    `);

    await knex.raw(`
      UPDATE sla_breaches b
      SET
        definition_id = d.definition_id,
        trigger_policy_id = tp.trigger_policy_id
      FROM sla_definitions d
      LEFT JOIN sla_trigger_policies tp
        ON tp.tenant_id = d.tenant_id
       AND tp.legacy_policy_id = d.legacy_policy_id
      WHERE b.policy_id = d.legacy_policy_id
        AND b.tenant_id = d.tenant_id
    `);

    await knex.raw(`
      UPDATE sla_breaches
      SET metric = CASE
        WHEN metric = 'frt' THEN 'first_response'
        WHEN metric = 'assignment_reassign' THEN 'assignment_accept'
        WHEN metric = 'unanswered_auto_close' THEN 'follow_up'
        WHEN metric = 'ttr' THEN 'resolution'
        ELSE metric
      END
    `);

    await knex.raw("ALTER TABLE sla_breaches DROP COLUMN IF EXISTS policy_id");
    await knex.raw("DROP POLICY IF EXISTS sla_policies_tenant_isolation ON sla_policies");
    await knex.raw("DROP TRIGGER IF EXISTS sla_policies_set_updated_at ON sla_policies");
    await knex.schema.dropTableIfExists("sla_policies");
  }

  await knex.raw("ALTER TABLE sla_definitions DROP COLUMN IF EXISTS legacy_policy_id");
  await knex.raw("ALTER TABLE sla_trigger_policies DROP COLUMN IF EXISTS legacy_policy_id");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS sla_breaches_tenant_trigger_created_idx");
  await knex.raw("DROP INDEX IF EXISTS sla_breaches_tenant_definition_created_idx");
  if (await knex.schema.hasColumn("sla_breaches", "trigger_policy_id")) {
    await knex.schema.alterTable("sla_breaches", (t) => t.dropColumn("trigger_policy_id"));
  }
  if (await knex.schema.hasColumn("sla_breaches", "definition_id")) {
    await knex.schema.alterTable("sla_breaches", (t) => t.dropColumn("definition_id"));
  }
  await knex.raw("DROP POLICY IF EXISTS sla_trigger_policies_tenant_isolation ON sla_trigger_policies");
  await knex.raw("DROP TRIGGER IF EXISTS sla_trigger_policies_set_updated_at ON sla_trigger_policies");
  await knex.schema.dropTableIfExists("sla_trigger_policies");
  await knex.raw("DROP POLICY IF EXISTS sla_definitions_tenant_isolation ON sla_definitions");
  await knex.raw("DROP TRIGGER IF EXISTS sla_definitions_set_updated_at ON sla_definitions");
  await knex.schema.dropTableIfExists("sla_definitions");
}

async function enableTenantRls(knex: Knex, table: string) {
  await knex.raw(`
    CREATE TRIGGER ${table}_set_updated_at
    BEFORE UPDATE ON ${table}
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
  await knex.raw(`
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY ${table}_tenant_isolation ON ${table}
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}
