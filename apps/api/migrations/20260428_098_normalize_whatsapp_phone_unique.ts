import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_whatsapp_phone_active");

  await knex.schema.raw(`
    CREATE UNIQUE INDEX uq_channel_configs_whatsapp_phone_active
    ON channel_configs (
      regexp_replace(coalesce(encrypted_config::jsonb ->> 'phoneNumberId', ''), '[^0-9]', '', 'g')
    )
    WHERE channel_type = 'whatsapp'
      AND is_active = true
      AND nullif(regexp_replace(coalesce(encrypted_config::jsonb ->> 'phoneNumberId', ''), '[^0-9]', '', 'g'), '') IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_whatsapp_phone_active");

  await knex.schema.raw(`
    CREATE UNIQUE INDEX uq_channel_configs_whatsapp_phone_active
    ON channel_configs ((encrypted_config::jsonb ->> 'phoneNumberId'))
    WHERE channel_type = 'whatsapp'
      AND is_active = true
      AND (encrypted_config::jsonb ->> 'phoneNumberId') IS NOT NULL;
  `);
}
