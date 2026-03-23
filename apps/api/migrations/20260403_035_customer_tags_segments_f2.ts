import type { Knex } from "knex";

const TABLES = ["customer_tags", "customer_tag_map", "customer_segments"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("customer_tags", (t) => {
    t.uuid("tag_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 60).notNullable();
    t.string("name", 80).notNullable();
    t.string("color", 20).notNullable().defaultTo("#1677ff");
    t.string("description", 300);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"], "customer_tags_tenant_code_uniq");
    t.index(["tenant_id", "is_active"], "customer_tags_tenant_active_idx");
  });

  await knex.schema.createTable("customer_tag_map", (t) => {
    t.bigIncrements("id").primary();
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("tag_id").notNullable().references("tag_id").inTable("customer_tags").onDelete("CASCADE");
    t.string("source", 20).notNullable().defaultTo("manual"); // manual | rule | import
    t.string("note", 300);
    t.uuid("assigned_by_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.timestamps(true, true);
    t.unique(["tenant_id", "customer_id", "tag_id"], "customer_tag_map_tenant_customer_tag_uniq");
    t.index(["tenant_id", "tag_id"], "customer_tag_map_tenant_tag_idx");
    t.index(["tenant_id", "customer_id"], "customer_tag_map_tenant_customer_idx");
  });

  await knex.schema.createTable("customer_segments", (t) => {
    t.uuid("segment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 80).notNullable();
    t.string("name", 120).notNullable();
    t.string("description", 300);
    t.jsonb("rule_json").notNullable().defaultTo("{}");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"], "customer_segments_tenant_code_uniq");
    t.index(["tenant_id", "is_active"], "customer_segments_tenant_active_idx");
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
    await knex("customer_tags").insert([
      { tenant_id: tenant.tenant_id, code: "vip", name: "VIP", color: "#faad14", description: "高价值客户", is_active: true },
      { tenant_id: tenant.tenant_id, code: "high_risk", name: "高风险", color: "#f5222d", description: "投诉频繁或负面情绪", is_active: true },
      { tenant_id: tenant.tenant_id, code: "churn_warning", name: "流失预警", color: "#722ed1", description: "长时间未联系", is_active: true }
    ]);

    await knex("customer_segments").insert([
      {
        tenant_id: tenant.tenant_id,
        code: "vip_customers",
        name: "VIP 客户",
        description: "带 VIP 标签的客户",
        rule_json: JSON.stringify({ tagsAny: ["vip"] }),
        is_active: true
      },
      {
        tenant_id: tenant.tenant_id,
        code: "high_risk_customers",
        name: "高风险客户",
        description: "带高风险标签的客户",
        rule_json: JSON.stringify({ tagsAny: ["high_risk"] }),
        is_active: true
      },
      {
        tenant_id: tenant.tenant_id,
        code: "churn_warning_customers",
        name: "流失预警客户",
        description: "30 天未联系客户",
        rule_json: JSON.stringify({ daysSinceLastConversationGte: 30 }),
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
  await knex.schema.dropTableIfExists("customer_segments");
  await knex.schema.dropTableIfExists("customer_tag_map");
  await knex.schema.dropTableIfExists("customer_tags");
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
