/**
 * 作用:
 * - 为 WA 会话补充联系人名称、联系人电话和未读数，作为工作台标准展示字段。
 *
 * 交互:
 * - 被 Baileys 的 contacts/chats/messages 事件持续更新。
 * - 被 WA 管理端、WA 工作台列表与详情接口直接读取。
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wa_conversations", (t) => {
    t.string("contact_name", 255);
    t.string("contact_phone_e164", 32);
    t.integer("unread_count").notNullable().defaultTo(0);
  });

  await knex.raw(`
    update wa_conversations
    set contact_phone_e164 = case
      when contact_jid ~ '^[0-9]+@s\\.whatsapp\\.net$' then '+' || split_part(contact_jid, '@', 1)
      when chat_jid ~ '^[0-9]+@s\\.whatsapp\\.net$' then '+' || split_part(chat_jid, '@', 1)
      else contact_phone_e164
    end
    where contact_phone_e164 is null
  `);

  await knex.raw(`
    update wa_conversations
    set contact_name = nullif(subject, '')
    where conversation_type = 'direct'
      and contact_name is null
      and nullif(subject, '') is not null
  `);

  await knex.raw(`
    with latest_contact_name as (
      select distinct on (m.wa_conversation_id)
        m.wa_conversation_id,
        nullif(m.provider_payload->>'pushName', '') as push_name
      from wa_messages m
      where m.direction = 'inbound'
        and nullif(m.provider_payload->>'pushName', '') is not null
      order by m.wa_conversation_id, m.logical_seq desc
    )
    update wa_conversations c
    set contact_name = l.push_name
    from latest_contact_name l
    where c.wa_conversation_id = l.wa_conversation_id
      and c.conversation_type = 'direct'
      and c.contact_name is null
  `);

  await knex.schema.alterTable("wa_conversations", (t) => {
    t.index(["tenant_id", "wa_account_id", "unread_count"], "wa_conversations_tenant_account_unread_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wa_conversations", (t) => {
    t.dropIndex(["tenant_id", "wa_account_id", "unread_count"], "wa_conversations_tenant_account_unread_idx");
    t.dropColumn("unread_count");
    t.dropColumn("contact_phone_e164");
    t.dropColumn("contact_name");
  });
}
