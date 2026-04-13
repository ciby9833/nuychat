import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("queue_assignments", "human_progress");
  if (!hasColumn) {
    await knex.schema.alterTable("queue_assignments", (table) => {
      table.text("human_progress").notNullable().defaultTo("none");
    });
  }

  await knex("queue_assignments").update({
    human_progress: knex.raw(`
      case
        when service_request_mode = 'human_requested' and assigned_agent_id is not null then 'assigned_waiting'
        when service_request_mode = 'human_requested' and queue_mode = 'pending_unavailable' and coalesce(ai_fallback_allowed, false) = false then 'queued_waiting'
        when service_request_mode = 'human_requested' and coalesce(ai_fallback_allowed, false) = true then 'unavailable_fallback_ai'
        else 'none'
      end
    `)
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("queue_assignments", "human_progress");
  if (hasColumn) {
    await knex.schema.alterTable("queue_assignments", (table) => {
      table.dropColumn("human_progress");
    });
  }
}
