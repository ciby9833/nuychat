/**
 * 作用:
 * - 新增客户档案表与 JID 绑定表，支持按客户维度追踪群聊中的发言与回复情况。
 * - 为 wa_conversation_reply_facts 补充 customer_participant_jid，加速聚合查询。
 *
 * 交互:
 * - wa-customer.service 读写 wa_customer_contacts / wa_customer_jid_bindings。
 * - wa-monitor.service 写 reply_facts 时顺带填充 customer_participant_jid。
 */
import type { Knex } from "knex";

async function enableTenantIsolation(knex: Knex, tableName: string) {
  await knex.raw(`
    ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;
    CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

async function disableTenantIsolation(knex: Knex, tableName: string) {
  await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
}

async function addUpdatedAtTrigger(knex: Knex, tableName: string) {
  await knex.raw(`
    CREATE TRIGGER ${tableName}_set_updated_at
    BEFORE UPDATE ON ${tableName}
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

async function dropUpdatedAtTrigger(knex: Knex, tableName: string) {
  await knex.raw(`DROP TRIGGER IF EXISTS ${tableName}_set_updated_at ON ${tableName}`);
}

export async function up(knex: Knex): Promise<void> {
  // ── 1. 客户档案 ─────────────────────────────────────────────────────────────
  await knex.schema.createTable("wa_customer_contacts", (t) => {
    t.uuid("wa_customer_contact_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");

    t.string("display_name", 255).notNullable();
    t.text("remarks");
    t.string("external_customer_id", 120);
    // active | archived
    t.string("customer_status", 20).notNullable().defaultTo("active");

    // 负责销售 / 客服
    t.uuid("owner_membership_id")
      .references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");

    t.uuid("created_by_membership_id")
      .references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamps(true, true);

    t.index(["tenant_id", "customer_status"], "wa_customer_contacts_tenant_status_idx");
    t.index(["tenant_id", "display_name"], "wa_customer_contacts_tenant_name_idx");
  });
  await enableTenantIsolation(knex, "wa_customer_contacts");
  await addUpdatedAtTrigger(knex, "wa_customer_contacts");

  // ── 2. JID → 客户绑定 ────────────────────────────────────────────────────────
  await knex.schema.createTable("wa_customer_jid_bindings", (t) => {
    t.uuid("binding_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");

    t.uuid("wa_customer_contact_id").notNullable()
      .references("wa_customer_contact_id").inTable("wa_customer_contacts").onDelete("CASCADE");

    // 同一个 WhatsApp 号在所有群里都是同一个人，全局唯一
    t.string("participant_jid", 191).notNullable();
    // 可选：在哪个群里完成了这次绑定（用于展示上下文备注）
    t.uuid("source_wa_conversation_id")
      .references("wa_conversation_id").inTable("wa_conversations").onDelete("SET NULL");

    t.string("binding_remarks", 255);

    t.uuid("created_by_membership_id")
      .references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamps(true, true);

    // 一个 JID 只能归属一个客户
    t.unique(["tenant_id", "participant_jid"], {
      indexName: "wa_customer_jid_bindings_jid_uniq"
    });
    t.index(["tenant_id", "wa_customer_contact_id"], "wa_customer_jid_bindings_contact_idx");
  });
  await enableTenantIsolation(knex, "wa_customer_jid_bindings");
  await addUpdatedAtTrigger(knex, "wa_customer_jid_bindings");

  // ── 3. 为 reply_facts 追加客户冗余字段（加速聚合，JOIN-free 报表查询）───────
  await knex.schema.alterTable("wa_conversation_reply_facts", (t) => {
    t.string("customer_participant_jid", 191);
    t.index(["tenant_id", "customer_participant_jid", "customer_message_at"],
      "wa_reply_facts_customer_jid_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wa_conversation_reply_facts", (t) => {
    t.dropIndex([], "wa_reply_facts_customer_jid_idx");
    t.dropColumn("customer_participant_jid");
  });

  for (const tableName of ["wa_customer_jid_bindings", "wa_customer_contacts"]) {
    await dropUpdatedAtTrigger(knex, tableName).catch(() => undefined);
    await disableTenantIsolation(knex, tableName).catch(() => undefined);
  }
  await knex.schema.dropTableIfExists("wa_customer_jid_bindings");
  await knex.schema.dropTableIfExists("wa_customer_contacts");
}
