/**
 * 作用:
 * - 为租户成员增加 WhatsApp 工作台准入标记。
 * - 该标记独立于现有客服 agent_profiles，避免把 WA 工作台与客服坐席资格混为一体。
 *
 * 交互:
 * - auth 模块: 登录/刷新 token 时读取该标记并回传给前端。
 * - wa-workspace 模块: workbench 路由强制要求该标记为 true。
 * - admin 模块: 提供开启/关闭 WA 座席资格的后台接口。
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenant_memberships", (t) => {
    t.boolean("wa_seat_enabled").notNullable().defaultTo(false);
  });

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_wa_seat_idx
    ON tenant_memberships (tenant_id, wa_seat_enabled, status);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS tenant_memberships_tenant_wa_seat_idx");
  await knex.schema.alterTable("tenant_memberships", (t) => {
    t.dropColumn("wa_seat_enabled");
  });
}
