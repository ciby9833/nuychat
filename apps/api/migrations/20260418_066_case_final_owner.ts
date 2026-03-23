import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasFinalOwnerType = await knex.schema.hasColumn("conversation_cases", "final_owner_type");
  if (!hasFinalOwnerType) {
    await knex.schema.alterTable("conversation_cases", (table) => {
      table.string("final_owner_type", 32).nullable();
      table.uuid("final_owner_id").nullable();
      table.uuid("resolved_by_agent_id").nullable();
    });
  }

  await knex.raw(`
    UPDATE conversation_cases AS cc
    SET
      final_owner_type = CASE
        WHEN (
          SELECT ce.actor_type
          FROM conversation_events ce
          WHERE ce.tenant_id = cc.tenant_id
            AND ce.conversation_id = cc.conversation_id
            AND ce.event_type = 'resolved'
            AND ce.actor_id IS NOT NULL
          ORDER BY ce.created_at DESC
          LIMIT 1
        ) = 'agent' THEN 'agent'
        WHEN (
          SELECT ce.actor_type
          FROM conversation_events ce
          WHERE ce.tenant_id = cc.tenant_id
            AND ce.conversation_id = cc.conversation_id
            AND ce.event_type = 'resolved'
            AND ce.actor_id IS NOT NULL
          ORDER BY ce.created_at DESC
          LIMIT 1
        ) = 'ai' THEN 'ai'
        ELSE cc.final_owner_type
      END,
      final_owner_id = COALESCE((
        SELECT ce.actor_id::uuid
        FROM conversation_events ce
        WHERE ce.tenant_id = cc.tenant_id
          AND ce.conversation_id = cc.conversation_id
          AND ce.event_type = 'resolved'
          AND ce.actor_id IS NOT NULL
        ORDER BY ce.created_at DESC
        LIMIT 1
      ), cc.final_owner_id),
      resolved_by_agent_id = CASE
        WHEN (
          SELECT ce.actor_type
          FROM conversation_events ce
          WHERE ce.tenant_id = cc.tenant_id
            AND ce.conversation_id = cc.conversation_id
            AND ce.event_type = 'resolved'
            AND ce.actor_id IS NOT NULL
          ORDER BY ce.created_at DESC
          LIMIT 1
        ) = 'agent' THEN (
          SELECT ce.actor_id::uuid
          FROM conversation_events ce
          WHERE ce.tenant_id = cc.tenant_id
            AND ce.conversation_id = cc.conversation_id
            AND ce.event_type = 'resolved'
            AND ce.actor_id IS NOT NULL
          ORDER BY ce.created_at DESC
          LIMIT 1
        )
        ELSE cc.resolved_by_agent_id
      END
    WHERE cc.status IN ('resolved', 'closed');
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasFinalOwnerType = await knex.schema.hasColumn("conversation_cases", "final_owner_type");
  if (!hasFinalOwnerType) return;

  await knex.schema.alterTable("conversation_cases", (table) => {
    table.dropColumn("resolved_by_agent_id");
    table.dropColumn("final_owner_id");
    table.dropColumn("final_owner_type");
  });
}
