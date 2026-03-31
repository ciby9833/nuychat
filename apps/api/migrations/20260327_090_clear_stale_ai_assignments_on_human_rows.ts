import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    update queue_assignments qa
    set assigned_ai_agent_id = null,
        updated_at = now()
    from conversations c
    where c.conversation_id = qa.conversation_id
      and c.tenant_id = qa.tenant_id
      and qa.assigned_ai_agent_id is not null
      and (
        qa.assigned_agent_id is not null
        or c.current_handler_type = 'human'
        or c.status = 'human_active'
      )
  `);
}

export async function down(): Promise<void> {
  // Destructive cleanup cannot be safely reversed.
}
