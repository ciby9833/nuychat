import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 允许同一租户有多条 whatsapp channel_configs（多号码支持）
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_tenant_type");

  // phoneNumberId 唯一约束保留：同一号码全局唯一（仅对非空值生效）
  // 已在 20260402_025 中建立，此处无需重建

  // 将 whatsapp phone 唯一索引改为仅约束 is_active=true 的行，
  // 支持解绑后其他租户/实例可以重新绑定同一号码
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_whatsapp_phone");
  await knex.schema.raw(`
    CREATE UNIQUE INDEX uq_channel_configs_whatsapp_phone_active
    ON channel_configs ((encrypted_config::jsonb ->> 'phoneNumberId'))
    WHERE channel_type = 'whatsapp'
      AND is_active = true
      AND (encrypted_config::jsonb ->> 'phoneNumberId') IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS uq_channel_configs_whatsapp_phone_active");

  // 恢复原有全局唯一约束
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_whatsapp_phone
    ON channel_configs ((encrypted_config::jsonb ->> 'phoneNumberId'))
    WHERE channel_type = 'whatsapp' AND (encrypted_config::jsonb ->> 'phoneNumberId') IS NOT NULL;
  `);

  // 恢复单例约束（down 时仅当数据满足条件才会成功）
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_configs_tenant_type
    ON channel_configs (tenant_id, channel_type);
  `);
}
