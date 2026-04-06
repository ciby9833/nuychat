/**
 * 作用:
 * - 新增 wa_contacts 表，持久化 contacts.upsert 事件带来的通讯录联系人。
 *
 * 交互:
 * - 被 wa-baileys-sync.service 在 contacts.upsert / contacts.update 时写入。
 * - 被 WA 工作台好友列表接口直接读取。
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("wa_contacts", (t) => {
    t.uuid("contact_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.string("contact_jid", 160).notNullable();
    t.string("phone_e164", 32);
    t.string("display_name", 255);
    t.string("notify_name", 255);   // push name / notify field
    t.string("verified_name", 255); // business verified name
    t.boolean("is_wa_contact").notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_account_id", "contact_jid"]);
    t.index(["tenant_id", "wa_account_id"], "wa_contacts_tenant_account_idx");
    t.index(["tenant_id", "wa_account_id", "phone_e164"], "wa_contacts_tenant_account_phone_idx");
  });

  await knex.raw(`
    ALTER TABLE wa_contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE wa_contacts FORCE ROW LEVEL SECURITY;
    CREATE POLICY wa_contacts_tenant_isolation ON wa_contacts
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER wa_contacts_set_updated_at
    BEFORE UPDATE ON wa_contacts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS wa_contacts_set_updated_at ON wa_contacts`);
  await knex.raw(`DROP POLICY IF EXISTS wa_contacts_tenant_isolation ON wa_contacts`);
  await knex.schema.dropTableIfExists("wa_contacts");
}
