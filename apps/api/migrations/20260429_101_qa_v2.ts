import type { Knex } from "knex";

const TABLES = [
  "qa_guidelines",
  "qa_review_tasks",
  "qa_ai_reviews",
  "qa_case_reviews",
  "qa_segment_reviews"
] as const;

const DEFAULT_GUIDELINE = `# QA准则

## 总则
- 以是否解决客户问题为第一优先
- 以礼貌、准确、清晰、合规作为核心评估维度
- 对转接场景，重点判断转接是否及时、是否合理、是否造成客户重复说明

## 通过标准
- 已明确解决问题，且表达礼貌、准确、无明显遗漏
- 若发生转接，转接过程合理，没有造成显著体验损失

## 风险标准
- 未解决客户问题却结束会话
- 回复明显错误、含糊、误导或不合规
- 多次转接且没有清晰推进
- 明显态度问题、推诿、机械应答
`;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("qa_guidelines", (t) => {
    t.uuid("guideline_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("name", 120).notNullable();
    t.string("scope", 32).notNullable().defaultTo("global");
    t.text("content_md").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("version").notNullable().defaultTo(1);
    t.timestamps(true, true);
    t.index(["tenant_id", "is_active"], "qa_guidelines_tenant_active_idx");
  });

  await knex.schema.createTable("qa_review_tasks", (t) => {
    t.uuid("qa_task_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("case_id").notNullable().references("case_id").inTable("conversation_cases").onDelete("CASCADE");
    t.string("source", 32).notNullable();
    t.string("review_mode", 32).notNullable();
    t.string("queue_type", 32).nullable();
    t.string("status", 32).notNullable().defaultTo("queued");
    t.string("ai_status", 32).notNullable().defaultTo("queued");
    t.string("risk_level", 16);
    t.jsonb("risk_reasons").notNullable().defaultTo("[]");
    t.decimal("confidence", 5, 4);
    t.string("recommended_action", 64);
    t.uuid("assigned_reviewer_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.uuid("guideline_id").references("guideline_id").inTable("qa_guidelines").onDelete("SET NULL");
    t.integer("guideline_version");
    t.timestamps(true, true);
    t.unique(["tenant_id", "case_id"], "qa_review_tasks_tenant_case_uniq");
    t.index(["tenant_id", "queue_type", "status"], "qa_review_tasks_queue_status_idx");
    t.index(["tenant_id", "created_at"], "qa_review_tasks_created_idx");
  });

  await knex.schema.createTable("qa_ai_reviews", (t) => {
    t.uuid("qa_ai_review_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("case_id").notNullable().references("case_id").inTable("conversation_cases").onDelete("CASCADE");
    t.uuid("qa_task_id").notNullable().references("qa_task_id").inTable("qa_review_tasks").onDelete("CASCADE");
    t.uuid("guideline_id").references("guideline_id").inTable("qa_guidelines").onDelete("SET NULL");
    t.integer("guideline_version");
    t.string("provider_name", 32);
    t.string("model", 160);
    t.integer("score").notNullable();
    t.string("verdict", 32).notNullable();
    t.decimal("confidence", 5, 4).notNullable().defaultTo(0);
    t.string("risk_level", 16);
    t.jsonb("risk_reasons").notNullable().defaultTo("[]");
    t.boolean("manual_review_recommended").notNullable().defaultTo(false);
    t.text("case_summary");
    t.jsonb("segment_reviews_json").notNullable().defaultTo("[]");
    t.jsonb("evidence_json").notNullable().defaultTo("[]");
    t.jsonb("raw_output_json").notNullable().defaultTo("{}");
    t.string("status", 32).notNullable().defaultTo("completed");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["tenant_id", "case_id", "created_at"], "qa_ai_reviews_case_created_idx");
    t.index(["tenant_id", "qa_task_id", "created_at"], "qa_ai_reviews_task_created_idx");
  });

  await knex.schema.createTable("qa_case_reviews", (t) => {
    t.uuid("qa_case_review_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("qa_task_id").notNullable().references("qa_task_id").inTable("qa_review_tasks").onDelete("CASCADE");
    t.uuid("case_id").notNullable().references("case_id").inTable("conversation_cases").onDelete("CASCADE");
    t.uuid("reviewer_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.string("source", 32).notNullable();
    t.string("final_owner_type", 32);
    t.uuid("final_owner_id");
    t.uuid("resolved_by_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.integer("total_score").notNullable();
    t.string("verdict", 32).notNullable();
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.text("summary");
    t.string("status", 20).notNullable().defaultTo("published");
    t.timestamps(true, true);
    t.unique(["tenant_id", "qa_task_id"], "qa_case_reviews_task_uniq");
    t.index(["tenant_id", "case_id", "updated_at"], "qa_case_reviews_case_updated_idx");
  });

  await knex.schema.createTable("qa_segment_reviews", (t) => {
    t.uuid("qa_segment_review_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("qa_case_review_id").notNullable().references("qa_case_review_id").inTable("qa_case_reviews").onDelete("CASCADE");
    t.uuid("segment_id").notNullable().references("segment_id").inTable("conversation_segments").onDelete("CASCADE");
    t.string("owner_type", 20);
    t.uuid("owner_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.uuid("owner_ai_agent_id").references("ai_agent_id").inTable("tenant_ai_agents").onDelete("SET NULL");
    t.integer("score").notNullable();
    t.jsonb("dimension_scores").notNullable().defaultTo("{}");
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.text("comment");
    t.timestamps(true, true);
    t.unique(["tenant_id", "qa_case_review_id", "segment_id"], "qa_segment_reviews_review_segment_uniq");
    t.index(["tenant_id", "segment_id"], "qa_segment_reviews_segment_idx");
  });

  for (const table of TABLES) {
    await knex.raw(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    `);
  }

  for (const table of ["qa_guidelines", "qa_review_tasks", "qa_case_reviews", "qa_segment_reviews"] as const) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  const tenants = await knex("tenants").select("tenant_id");
  for (const tenant of tenants as Array<{ tenant_id: string }>) {
    await knex("qa_guidelines").insert({
      tenant_id: tenant.tenant_id,
      name: "默认QA准则",
      scope: "global",
      content_md: DEFAULT_GUIDELINE,
      is_active: true,
      version: 1
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
  }
  for (const table of ["qa_guidelines", "qa_review_tasks", "qa_case_reviews", "qa_segment_reviews"] as const) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }

  await knex.schema.dropTableIfExists("qa_segment_reviews");
  await knex.schema.dropTableIfExists("qa_case_reviews");
  await knex.schema.dropTableIfExists("qa_ai_reviews");
  await knex.schema.dropTableIfExists("qa_review_tasks");
  await knex.schema.dropTableIfExists("qa_guidelines");
}
