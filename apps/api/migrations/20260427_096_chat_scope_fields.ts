import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("conversations", (t) => {
    t.string("chat_type", 20).notNullable().defaultTo("direct");
    t.string("chat_external_ref", 200);
    t.string("chat_name", 200);
  });

  await knex.schema.alterTable("messages", (t) => {
    t.string("chat_type", 20).notNullable().defaultTo("direct");
    t.string("chat_external_ref", 200);
    t.string("chat_name", 200);
    t.string("participant_external_ref", 200);
    t.string("participant_display_name", 200);
  });

  await knex.raw(`
    UPDATE conversations AS c
    SET
      chat_type = 'direct',
      chat_external_ref = coalesce(cu.external_ref, c.chat_external_ref),
      chat_name = coalesce(c.chat_name, cu.display_name)
    FROM customers AS cu
    WHERE cu.customer_id = c.customer_id
      AND cu.tenant_id = c.tenant_id
      AND (c.chat_external_ref IS NULL OR c.chat_external_ref = '');
  `);

  await knex.raw(`
    UPDATE messages AS m
    SET
      chat_type = coalesce(c.chat_type, 'direct'),
      chat_external_ref = coalesce(c.chat_external_ref, m.chat_external_ref),
      chat_name = coalesce(c.chat_name, m.chat_name),
      participant_external_ref = coalesce(
        m.participant_external_ref,
        CASE
          WHEN m.direction = 'inbound' AND jsonb_exists(m.content, 'senderExternalRef')
            THEN m.content->>'senderExternalRef'
          ELSE NULL
        END
      ),
      participant_display_name = coalesce(
        m.participant_display_name,
        CASE
          WHEN m.direction = 'inbound' AND jsonb_exists(m.content, 'participantDisplayName')
            THEN nullif(m.content->>'participantDisplayName', '')
          WHEN m.direction = 'inbound'
            THEN nullif(m.content #>> '{metadata,displayName}', '')
          ELSE NULL
        END
      )
    FROM conversations AS c
    WHERE c.conversation_id = m.conversation_id
      AND c.tenant_id = m.tenant_id;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS conversations_chat_scope_lookup_idx
    ON conversations (tenant_id, channel_id, chat_type, chat_external_ref, status);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS conversations_chat_scope_lookup_idx");

  await knex.schema.alterTable("messages", (t) => {
    t.dropColumn("participant_display_name");
    t.dropColumn("participant_external_ref");
    t.dropColumn("chat_name");
    t.dropColumn("chat_external_ref");
    t.dropColumn("chat_type");
  });

  await knex.schema.alterTable("conversations", (t) => {
    t.dropColumn("chat_name");
    t.dropColumn("chat_external_ref");
    t.dropColumn("chat_type");
  });
}
