import type { Knex } from "knex";

async function ensureColumn(knex: Knex, table: string, column: string, callback: () => Promise<unknown>) {
  const exists = await knex.schema.hasColumn(table, column);
  if (!exists) {
    await callback();
  }
}

export async function up(knex: Knex): Promise<void> {
  await ensureColumn(knex, "queue_assignments", "service_request_mode", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN service_request_mode varchar(32) NOT NULL DEFAULT 'normal'"));
  await ensureColumn(knex, "queue_assignments", "queue_mode", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN queue_mode varchar(32) NOT NULL DEFAULT 'none'"));
  await ensureColumn(knex, "queue_assignments", "queue_position", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN queue_position integer"));
  await ensureColumn(knex, "queue_assignments", "estimated_wait_sec", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN estimated_wait_sec integer"));
  await ensureColumn(knex, "queue_assignments", "ai_fallback_allowed", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN ai_fallback_allowed boolean NOT NULL DEFAULT false"));
  await ensureColumn(knex, "queue_assignments", "locked_human_side", () =>
    knex.raw("ALTER TABLE queue_assignments ADD COLUMN locked_human_side boolean NOT NULL DEFAULT false"));

  await knex.raw(`
    UPDATE queue_assignments
    SET
      service_request_mode = CASE
        WHEN handoff_required THEN 'human_requested'
        ELSE 'normal'
      END,
      queue_mode = CASE
        WHEN status = 'resolved' THEN 'none'
        WHEN assigned_agent_id IS NOT NULL THEN 'assigned_waiting'
        WHEN handoff_required OR status = 'pending' THEN 'pending_unavailable'
        ELSE 'none'
      END,
      ai_fallback_allowed = CASE
        WHEN handoff_required THEN true
        ELSE false
      END,
      locked_human_side = CASE
        WHEN handoff_required THEN true
        ELSE false
      END
  `);
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("queue_assignments");
  if (!exists) return;

  await knex.schema.alterTable("queue_assignments", (t) => {
    t.dropColumn("locked_human_side");
    t.dropColumn("ai_fallback_allowed");
    t.dropColumn("estimated_wait_sec");
    t.dropColumn("queue_position");
    t.dropColumn("queue_mode");
    t.dropColumn("service_request_mode");
  });
}
