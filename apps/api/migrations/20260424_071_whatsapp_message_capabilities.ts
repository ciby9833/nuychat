import type { Knex } from "knex";

const MESSAGE_STATUS_VALUES = [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "deleted"
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (t) => {
    t.string("channel_message_type", 30);
    t.string("message_status", 20).notNullable().defaultTo("queued");
    t.timestamp("status_sent_at", { useTz: true });
    t.timestamp("status_delivered_at", { useTz: true });
    t.timestamp("status_read_at", { useTz: true });
    t.timestamp("status_failed_at", { useTz: true });
    t.timestamp("status_deleted_at", { useTz: true });
    t.uuid("reply_to_message_id").references("message_id").inTable("messages").onDelete("SET NULL");
    t.string("reply_to_external_id", 200);
    t.uuid("reaction_target_message_id").references("message_id").inTable("messages").onDelete("SET NULL");
    t.string("reaction_target_external_id", 200);
    t.string("reaction_emoji", 32);
    t.boolean("is_forwarded").notNullable().defaultTo(false);
    t.boolean("is_frequently_forwarded").notNullable().defaultTo(false);
    t.boolean("is_voice_message").notNullable().defaultTo(false);
    t.string("status_error_code", 80);
    t.text("status_error_title");
  });

  await knex.raw(`
    ALTER TABLE messages
    ADD CONSTRAINT messages_message_status_check
    CHECK (message_status IN (${MESSAGE_STATUS_VALUES.map((value) => `'${value}'`).join(", ")}))
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS messages_tenant_external_idx
    ON messages (tenant_id, external_id)
    WHERE external_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS messages_tenant_reply_to_external_idx
    ON messages (tenant_id, reply_to_external_id)
    WHERE reply_to_external_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS messages_tenant_reply_to_external_idx");
  await knex.raw("DROP INDEX IF EXISTS messages_tenant_external_idx");
  await knex.raw("ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_status_check");

  await knex.schema.alterTable("messages", (t) => {
    t.dropColumn("channel_message_type");
    t.dropColumn("message_status");
    t.dropColumn("status_sent_at");
    t.dropColumn("status_delivered_at");
    t.dropColumn("status_read_at");
    t.dropColumn("status_failed_at");
    t.dropColumn("status_deleted_at");
    t.dropColumn("reply_to_message_id");
    t.dropColumn("reply_to_external_id");
    t.dropColumn("reaction_target_message_id");
    t.dropColumn("reaction_target_external_id");
    t.dropColumn("reaction_emoji");
    t.dropColumn("is_forwarded");
    t.dropColumn("is_frequently_forwarded");
    t.dropColumn("is_voice_message");
    t.dropColumn("status_error_code");
    t.dropColumn("status_error_title");
  });
}
