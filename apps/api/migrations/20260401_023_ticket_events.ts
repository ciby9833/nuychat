import type { Knex } from "knex";

/**
 * Migration 023 — ticket_events
 *
 * Immutable audit-log for every state transition on a ticket.
 * One row is appended whenever a ticket is:
 *   • created
 *   • status changed (open → in_progress → resolved → closed)
 *   • priority changed
 *   • assigned / unassigned
 *   • a note is added
 *   • SLA warning threshold crossed (< 1 h remaining)
 *   • SLA breached (deadline passed while still open)
 *
 * The table is append-only: no updates, no soft-deletes.
 *
 * Consumed by:
 *   • ticket.routes.ts  — inserts events on every mutation
 *   • sla.worker.ts     — inserts sla_warning / sla_breached events
 *   • GET /api/tickets/:id/events  — agent workspace ticket audit trail
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ticket_events", (t) => {
    t.uuid("event_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));

    t.uuid("tenant_id")
      .notNullable()
      .references("tenant_id")
      .inTable("tenants")
      .onDelete("CASCADE");

    // Ticket this event belongs to; cascade delete keeps referential integrity
    t.uuid("ticket_id")
      .notNullable()
      .references("ticket_id")
      .inTable("tickets")
      .onDelete("CASCADE");

    // Type of event (open enum stored as varchar for extensibility)
    // created | status_changed | priority_changed | assigned | unassigned
    // note_added | sla_warning | sla_breached
    t.string("event_type", 40).notNullable();

    // Previous value (e.g. old status, old priority, old assignee_id)
    t.string("from_value", 200);

    // New value after the change
    t.string("to_value", 200);

    // Who performed the action: agent | ai | system
    t.string("actor_type", 20).notNullable().defaultTo("system");

    // Identity (agent_id or system identifier) — nullable for automated events
    t.uuid("actor_id");

    // Optional extra context (e.g. note body preview, SLA breach details)
    t.jsonb("metadata").defaultTo("{}");

    // Append-only: no updated_at
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "ticket_id"], "ticket_events_ticket_idx");
    t.index(["tenant_id", "event_type"], "ticket_events_type_idx");
    t.index(["ticket_id", "created_at"], "ticket_events_time_idx");
  });

  // ── Row-Level Security ──────────────────────────────────────────────────────
  await knex.raw("ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY");
  await knex.raw(`
    CREATE POLICY ticket_events_tenant_isolation ON ticket_events
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP POLICY IF EXISTS ticket_events_tenant_isolation ON ticket_events");
  await knex.schema.dropTableIfExists("ticket_events");
}
