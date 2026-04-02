import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasCaseTasks = await knex.schema.hasTable("case_tasks");
  if (!hasCaseTasks) return;

  const hasTable = await knex.schema.hasTable("case_task_events");
  if (!hasTable) {
    await knex.schema.createTable("case_task_events", (t) => {
      t.uuid("event_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
      t.uuid("task_id").notNullable().references("task_id").inTable("case_tasks").onDelete("CASCADE");
      t.text("event_type").notNullable();
      t.text("from_value");
      t.text("to_value");
      t.text("actor_type").notNullable();
      t.uuid("actor_id");
      t.jsonb("metadata").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_case_task_events_task
    ON case_task_events (tenant_id, task_id, created_at DESC);
  `);

  await knex.raw(`
    ALTER TABLE case_task_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE case_task_events FORCE ROW LEVEL SECURITY;
  `);

  await knex.raw("DROP POLICY IF EXISTS case_task_events_tenant_isolation ON case_task_events");
  await knex.raw(`
    CREATE POLICY case_task_events_tenant_isolation ON case_task_events
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP POLICY IF EXISTS case_task_events_tenant_isolation ON case_task_events");
  await knex.schema.dropTableIfExists("case_task_events");
}
