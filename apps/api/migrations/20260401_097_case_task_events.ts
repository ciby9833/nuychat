import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── case_task_events: append-only audit log for case task state changes ────
  // Equivalent to the old ticket_events table (dropped in migration 077),
  // but for the new case_tasks system.
  await knex.schema.createTable("case_task_events", (t) => {
    t.uuid("event_id").primary().defaultTo(knex.fn.uuid());
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("task_id").notNullable().references("task_id").inTable("case_tasks").onDelete("CASCADE");
    t.text("event_type").notNullable();
    // event_type values:
    //   created | status_changed | priority_changed | assigned | unassigned |
    //   comment_added | ai_completed
    t.text("from_value");
    t.text("to_value");
    t.text("actor_type").notNullable(); // "agent" | "admin" | "ai" | "system"
    t.uuid("actor_id"); // agent_id, identity_id, ai_agent_id, or null for system
    t.jsonb("metadata").defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Indexes for common query patterns
  await knex.schema.raw(`
    CREATE INDEX idx_case_task_events_task ON case_task_events (tenant_id, task_id, created_at DESC);
  `);

  // RLS
  await knex.schema.raw(`
    ALTER TABLE case_task_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_case_task_events ON case_task_events
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP POLICY IF EXISTS tenant_isolation_case_task_events ON case_task_events");
  await knex.schema.dropTableIfExists("case_task_events");
}
