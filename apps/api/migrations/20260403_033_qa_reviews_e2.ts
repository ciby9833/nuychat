import type { Knex } from "knex";

const TABLES = ["qa_scoring_rules", "qa_reviews"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("qa_scoring_rules", (t) => {
    t.uuid("rule_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 60).notNullable();
    t.string("name", 120).notNullable();
    t.integer("weight").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(100);
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"], "qa_scoring_rules_tenant_code_uniq");
    t.index(["tenant_id", "is_active"], "qa_scoring_rules_tenant_active_idx");
  });

  await knex.schema.createTable("qa_reviews", (t) => {
    t.uuid("review_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("reviewer_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.uuid("agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.integer("score").notNullable();
    t.jsonb("dimension_scores").notNullable().defaultTo("{}");
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.text("note");
    t.string("status", 20).notNullable().defaultTo("published"); // draft | published
    t.timestamps(true, true);
    t.unique(["tenant_id", "conversation_id"], "qa_reviews_tenant_conversation_uniq");
    t.index(["tenant_id", "agent_id", "created_at"], "qa_reviews_tenant_agent_created_idx");
    t.index(["tenant_id", "score", "created_at"], "qa_reviews_tenant_score_created_idx");
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
    await knex("qa_scoring_rules").insert([
      { tenant_id: tenant.tenant_id, code: "politeness", name: "礼貌用语", weight: 20, sort_order: 10, is_active: true },
      { tenant_id: tenant.tenant_id, code: "resolution", name: "解决能力", weight: 40, sort_order: 20, is_active: true },
      { tenant_id: tenant.tenant_id, code: "response_speed", name: "响应速度", weight: 20, sort_order: 30, is_active: true },
      { tenant_id: tenant.tenant_id, code: "ai_usage", name: "AI 使用规范", weight: 20, sort_order: 40, is_active: true }
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }
  await knex.schema.dropTableIfExists("qa_reviews");
  await knex.schema.dropTableIfExists("qa_scoring_rules");
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
