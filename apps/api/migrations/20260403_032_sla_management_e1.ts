import type { Knex } from "knex";

const TABLES = ["sla_policies", "sla_breaches"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sla_policies", (t) => {
    t.uuid("policy_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("name", 120).notNullable();
    t.string("priority", 30).notNullable().defaultTo("standard");
    t.integer("first_response_target_sec").notNullable();
    t.integer("resolution_target_sec").notNullable();
    t.integer("escalation_after_sec").notNullable().defaultTo(0);
    t.jsonb("conditions").notNullable().defaultTo("{}");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "name"], "sla_policies_tenant_name_uniq");
    t.index(["tenant_id", "is_active"], "sla_policies_tenant_active_idx");
    t.index(["tenant_id", "priority"], "sla_policies_tenant_priority_idx");
  });

  await knex.schema.createTable("sla_breaches", (t) => {
    t.uuid("breach_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("policy_id").references("policy_id").inTable("sla_policies").onDelete("SET NULL");
    t.uuid("conversation_id");
    t.uuid("agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.string("metric", 20).notNullable(); // frt | aht | ttr
    t.integer("target_sec").notNullable();
    t.integer("actual_sec").notNullable();
    t.integer("breach_sec").notNullable();
    t.string("severity", 20).notNullable().defaultTo("warning"); // warning | critical
    t.string("status", 20).notNullable().defaultTo("open"); // open | acknowledged | resolved
    t.timestamp("acknowledged_at", { useTz: true });
    t.timestamp("resolved_at", { useTz: true });
    t.jsonb("details").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.index(["tenant_id", "status", "created_at"], "sla_breaches_tenant_status_created_idx");
    t.index(["tenant_id", "metric", "created_at"], "sla_breaches_tenant_metric_created_idx");
  });

  for (const table of TABLES) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
    await enableTenantRls(knex, table);
  }

  const tenants = await knex("tenants").select("tenant_id");
  for (const tenant of tenants as Array<{ tenant_id: string }>) {
    await knex("sla_policies").insert([
      {
        tenant_id: tenant.tenant_id,
        name: "VIP 快速响应",
        priority: "vip",
        first_response_target_sec: 60,
        resolution_target_sec: 1800,
        escalation_after_sec: 300,
        conditions: JSON.stringify({ tagsAny: ["VIP"] }),
        is_active: true
      },
      {
        tenant_id: tenant.tenant_id,
        name: "标准客服",
        priority: "standard",
        first_response_target_sec: 300,
        resolution_target_sec: 7200,
        escalation_after_sec: 900,
        conditions: JSON.stringify({}),
        is_active: true
      }
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }
  await knex.schema.dropTableIfExists("sla_breaches");
  await knex.schema.dropTableIfExists("sla_policies");
}

async function enableTenantRls(knex: Knex, table: string) {
  await knex.raw(`
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY ${table}_tenant_isolation ON ${table}
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}
