import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("case_tasks", (t) => {
    t.uuid("task_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("case_id").notNullable().references("case_id").inTable("conversation_cases").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("SET NULL");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("SET NULL");
    t.uuid("source_message_id").references("message_id").inTable("messages").onDelete("SET NULL");
    t.string("task_type", 40).notNullable().defaultTo("follow_up");
    t.string("title", 200).notNullable();
    t.text("description");
    t.string("status", 30).notNullable().defaultTo("open");
    t.string("priority", 20).notNullable().defaultTo("normal");
    t.uuid("owner_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.timestamp("due_at", { useTz: true });
    t.timestamp("started_at", { useTz: true });
    t.timestamp("completed_at", { useTz: true });
    t.timestamp("cancelled_at", { useTz: true });
    t.string("creator_type", 20).notNullable().defaultTo("agent");
    t.uuid("creator_identity_id");
    t.uuid("creator_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.timestamp("last_commented_at", { useTz: true });
    t.timestamps(true, true);

    t.index(["tenant_id", "case_id", "created_at"], "case_tasks_case_idx");
    t.index(["tenant_id", "conversation_id", "created_at"], "case_tasks_conversation_idx");
    t.index(["tenant_id", "owner_agent_id", "status", "created_at"], "case_tasks_owner_idx");
    t.index(["tenant_id", "status", "due_at"], "case_tasks_status_due_idx");
  });

  await knex.schema.createTable("case_task_comments", (t) => {
    t.uuid("comment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("task_id").notNullable().references("task_id").inTable("case_tasks").onDelete("CASCADE");
    t.text("body").notNullable();
    t.boolean("is_internal").notNullable().defaultTo(true);
    t.string("author_type", 20).notNullable().defaultTo("agent");
    t.uuid("author_identity_id");
    t.uuid("author_agent_id").references("agent_id").inTable("agent_profiles").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "task_id", "created_at"], "case_task_comments_task_idx");
  });

  await knex.raw(`
    ALTER TABLE case_tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE case_tasks FORCE ROW LEVEL SECURITY;
    CREATE POLICY case_tasks_tenant_isolation ON case_tasks
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    ALTER TABLE case_task_comments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE case_task_comments FORCE ROW LEVEL SECURITY;
    CREATE POLICY case_task_comments_tenant_isolation ON case_task_comments
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER case_tasks_set_updated_at
    BEFORE UPDATE ON case_tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS case_tasks_set_updated_at ON case_tasks");
  await knex.raw("DROP POLICY IF EXISTS case_task_comments_tenant_isolation ON case_task_comments");
  await knex.raw("DROP POLICY IF EXISTS case_tasks_tenant_isolation ON case_tasks");
  await knex.schema.dropTableIfExists("case_task_comments");
  await knex.schema.dropTableIfExists("case_tasks");
}
