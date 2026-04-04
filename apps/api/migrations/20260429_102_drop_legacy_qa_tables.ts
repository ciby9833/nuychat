import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("qa_scoring_schemes");
  await knex.schema.dropTableIfExists("qa_reviews");
  await knex.schema.dropTableIfExists("qa_scoring_rules");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("qa_scoring_schemes", (t) => {
    t.uuid("scheme_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("scope", 16).notNullable();
    t.jsonb("dimensions").notNullable().defaultTo("[]");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["tenant_id", "scope", "is_active"], "qa_scoring_schemes_scope_active_idx");
  });

  await knex.schema.createTable("qa_scoring_rules", (t) => {
    t.uuid("rule_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("code", 64).notNullable();
    t.string("name", 128).notNullable();
    t.integer("weight").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.unique(["tenant_id", "code"], "qa_scoring_rules_tenant_code_uniq");
    t.index(["tenant_id", "is_active"], "qa_scoring_rules_tenant_active_idx");
  });

  await knex.schema.createTable("qa_reviews", (t) => {
    t.uuid("review_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("case_id").nullable().references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.uuid("reviewer_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.uuid("agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.integer("score").notNullable();
    t.jsonb("dimension_scores").notNullable().defaultTo("{}");
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.text("note");
    t.string("status", 20).notNullable().defaultTo("draft");
    t.timestamps(true, true);
    t.unique(["tenant_id", "conversation_id"], "qa_reviews_tenant_conversation_uniq");
    t.index(["tenant_id", "agent_id", "created_at"], "qa_reviews_tenant_agent_created_idx");
    t.index(["tenant_id", "score", "created_at"], "qa_reviews_tenant_score_created_idx");
    t.index(["tenant_id", "case_id", "created_at"], "qa_reviews_tenant_case_created_idx");
  });
}
