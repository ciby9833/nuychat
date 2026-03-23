import type { Knex } from "knex";

const ACTIVE_CASE_STATUSES = ["open", "in_progress", "waiting_customer", "waiting_internal"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("conversation_cases", (t) => {
    t.uuid("case_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("customer_id").notNullable().references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("current_segment_id").references("segment_id").inTable("conversation_segments").onDelete("SET NULL");
    t.uuid("parent_case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.string("case_type", 80).notNullable().defaultTo("general_inquiry");
    t.string("case_source", 40).notNullable().defaultTo("system");
    t.string("title", 255).notNullable();
    t.text("summary");
    t.string("status", 40).notNullable().defaultTo("open");
    t.string("priority", 20).notNullable().defaultTo("normal");
    t.string("current_owner_type", 20).notNullable().defaultTo("system");
    t.uuid("current_owner_id");
    t.timestamp("opened_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("resolved_at", { useTz: true });
    t.timestamp("closed_at", { useTz: true });
    t.timestamp("last_customer_message_at", { useTz: true });
    t.timestamp("last_agent_message_at", { useTz: true });
    t.timestamp("last_ai_message_at", { useTz: true });
    t.timestamp("last_activity_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.index(["tenant_id", "conversation_id", "status", "last_activity_at"], "conversation_cases_conversation_status_idx");
    t.index(["tenant_id", "customer_id", "status", "last_activity_at"], "conversation_cases_customer_status_idx");
    t.index(["tenant_id", "current_owner_type", "current_owner_id", "status"], "conversation_cases_owner_status_idx");
    t.index(["tenant_id", "case_type", "status", "last_activity_at"], "conversation_cases_type_status_idx");
  });

  await knex.raw(`
    CREATE UNIQUE INDEX conversation_cases_single_active_idx
    ON conversation_cases (tenant_id, conversation_id)
    WHERE status IN (${ACTIVE_CASE_STATUSES.map((status) => `'${status}'`).join(", ")})
  `);

  await knex.raw(`
    ALTER TABLE conversation_cases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversation_cases FORCE ROW LEVEL SECURITY;
    CREATE POLICY conversation_cases_tenant_isolation ON conversation_cases
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER conversation_cases_set_updated_at
    BEFORE UPDATE ON conversation_cases
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.alterTable("conversations", (t) => {
    t.uuid("current_case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.index(["tenant_id", "current_case_id"], "conversations_tenant_current_case_idx");
  });

  await knex.schema.alterTable("conversation_segments", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.index(["tenant_id", "case_id", "started_at"], "conversation_segments_case_started_idx");
  });

  await knex.schema.alterTable("messages", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.index(["tenant_id", "case_id", "created_at"], "messages_tenant_case_created_idx");
  });

  await knex.schema.alterTable("async_tasks", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.index(["tenant_id", "case_id", "created_at"], "async_tasks_case_idx");
  });

  await knex.schema.alterTable("conversation_intelligence", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.index(["tenant_id", "case_id", "updated_at"], "conversation_intelligence_case_idx");
  });

  await knex.schema.alterTable("customer_memory_items", (t) => {
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.index(["tenant_id", "case_id", "memory_type"], "customer_memory_items_case_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("customer_memory_items", (t) => {
    t.dropIndex(["tenant_id", "case_id", "memory_type"], "customer_memory_items_case_idx");
    t.dropColumn("case_id");
  });

  await knex.schema.alterTable("conversation_intelligence", (t) => {
    t.dropIndex(["tenant_id", "case_id", "updated_at"], "conversation_intelligence_case_idx");
    t.dropColumn("case_id");
  });

  await knex.schema.alterTable("async_tasks", (t) => {
    t.dropIndex(["tenant_id", "case_id", "created_at"], "async_tasks_case_idx");
    t.dropColumn("case_id");
  });

  await knex.schema.alterTable("messages", (t) => {
    t.dropIndex(["tenant_id", "case_id", "created_at"], "messages_tenant_case_created_idx");
    t.dropColumn("case_id");
  });

  await knex.schema.alterTable("conversation_segments", (t) => {
    t.dropIndex(["tenant_id", "case_id", "started_at"], "conversation_segments_case_started_idx");
    t.dropColumn("case_id");
  });

  await knex.schema.alterTable("conversations", (t) => {
    t.dropIndex(["tenant_id", "current_case_id"], "conversations_tenant_current_case_idx");
    t.dropColumn("current_case_id");
  });

  await knex.raw("DROP TRIGGER IF EXISTS conversation_cases_set_updated_at ON conversation_cases");
  await knex.raw("DROP POLICY IF EXISTS conversation_cases_tenant_isolation ON conversation_cases");
  await knex.raw("DROP INDEX IF EXISTS conversation_cases_single_active_idx");
  await knex.schema.dropTableIfExists("conversation_cases");
}
