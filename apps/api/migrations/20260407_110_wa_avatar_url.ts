/**
 * 作用:
 * - 为 wa_contacts 和 wa_conversations 增加 avatar_url 字段。
 * - avatar_url 由后台在账号连接后异步调用 profilePictureUrl() 获取，存储临时 CDN URL。
 *
 * 交互:
 * - wa-baileys-sync.service: 在连接就绪后批量写入。
 * - WA 工作台接口: 返回给前端用于显示头像。
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wa_contacts", (t) => {
    t.string("avatar_url", 2048).nullable();
    t.timestamp("avatar_fetched_at").nullable();
  });

  await knex.schema.alterTable("wa_conversations", (t) => {
    t.string("avatar_url", 2048).nullable();
    t.timestamp("avatar_fetched_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wa_contacts", (t) => {
    t.dropColumn("avatar_fetched_at");
    t.dropColumn("avatar_url");
  });
  await knex.schema.alterTable("wa_conversations", (t) => {
    t.dropColumn("avatar_fetched_at");
    t.dropColumn("avatar_url");
  });
}
