import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_whatsapp_phone
    ON channel_configs ((encrypted_config::jsonb ->> 'phoneNumberId'))
    WHERE channel_type = 'whatsapp' AND (encrypted_config::jsonb ->> 'phoneNumberId') IS NOT NULL;
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_web_public_key
    ON channel_configs ((encrypted_config::jsonb ->> 'publicChannelKey'))
    WHERE channel_type = 'web' AND (encrypted_config::jsonb ->> 'publicChannelKey') IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_web_public_key");
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_whatsapp_phone");
}
