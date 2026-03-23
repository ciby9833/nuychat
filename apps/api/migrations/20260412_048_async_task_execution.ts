import type { Knex } from "knex";

const TENANT_TABLES = ["async_tasks", "async_task_artifacts"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("async_tasks", (t) => {
    t.uuid("task_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("SET NULL");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("SET NULL");
    t.string("task_type", 80).notNullable();
    t.string("title", 160).notNullable();
    t.string("source", 40).notNullable().defaultTo("system");
    t.string("status", 30).notNullable().defaultTo("queued");
    t.integer("priority").notNullable().defaultTo(100);
    t.string("scheduler_key", 120);
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.text("result_summary");
    t.jsonb("result_meta").notNullable().defaultTo("{}");
    t.text("artifact_dir");
    t.text("last_error");
    t.timestamp("started_at", { useTz: true });
    t.timestamp("completed_at", { useTz: true });
    t.timestamp("published_at", { useTz: true });
    t.string("created_by_type", 20).notNullable().defaultTo("system");
    t.uuid("created_by_id");
    t.timestamps(true, true);

    t.index(["tenant_id", "conversation_id", "created_at"], "async_tasks_conversation_idx");
    t.index(["tenant_id", "customer_id", "created_at"], "async_tasks_customer_idx");
    t.index(["tenant_id", "status", "created_at"], "async_tasks_status_idx");
  });

  await knex.schema.createTable("async_task_artifacts", (t) => {
    t.uuid("artifact_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("task_id").notNullable().references("task_id").inTable("async_tasks").onDelete("CASCADE");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("SET NULL");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("SET NULL");
    t.string("kind", 50).notNullable();
    t.string("file_name", 200).notNullable();
    t.text("file_path").notNullable();
    t.string("mime_type", 120).notNullable().defaultTo("text/plain");
    t.integer("sequence_no").notNullable().defaultTo(1);
    t.bigInteger("size_bytes").notNullable().defaultTo(0);
    t.text("content_preview");
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "task_id", "sequence_no"], "async_task_artifacts_task_idx");
    t.index(["tenant_id", "conversation_id", "created_at"], "async_task_artifacts_conversation_idx");
  });

  for (const table of TENANT_TABLES) {
    await knex.raw(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    `);
  }

  await knex.raw(`
    CREATE TRIGGER async_tasks_set_updated_at
    BEFORE UPDATE ON async_tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS async_tasks_set_updated_at ON async_tasks");
  await knex.raw("DROP POLICY IF EXISTS async_task_artifacts_tenant_isolation ON async_task_artifacts");
  await knex.raw("DROP POLICY IF EXISTS async_tasks_tenant_isolation ON async_tasks");
  await knex.schema.dropTableIfExists("async_task_artifacts");
  await knex.schema.dropTableIfExists("async_tasks");
}
