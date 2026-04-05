/**
 * 作用:
 * - 为 WA Workspace 增加更细粒度的消息回执与 Baileys auth 快照表。
 *
 * 交互:
 * - `wa_message_receipts` 支撑 message-receipt.update 的 read/played 等状态落库。
 * - `wa_baileys_auth_snapshots` 为多文件 session 提供 DB 快照兜底，便于生产恢复。
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
  await knex.raw("ALTER TABLE wa_accounts ALTER COLUMN provider_key SET DEFAULT 'baileys'");
  await knex.raw("ALTER TABLE wa_account_sessions ALTER COLUMN session_provider SET DEFAULT 'baileys'");

  await knex.schema.createTable("wa_message_receipts", (t) => {
    t.uuid("receipt_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_message_id").notNullable().references("wa_message_id").inTable("wa_messages").onDelete("CASCADE");
    t.string("user_jid", 191).notNullable();
    t.string("receipt_status", 20).notNullable().defaultTo("server_ack");
    t.bigInteger("receipt_ts");
    t.bigInteger("read_ts");
    t.bigInteger("played_ts");
    t.jsonb("pending_device_jids").notNullable().defaultTo("[]");
    t.jsonb("delivered_device_jids").notNullable().defaultTo("[]");
    t.jsonb("provider_payload").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_message_id", "user_jid"], { indexName: "wa_message_receipts_tenant_msg_user_uniq" });
    t.index(["tenant_id", "wa_message_id"], "wa_message_receipts_tenant_message_idx");
  });
  await enableTenantIsolation(knex, "wa_message_receipts");
  await addUpdatedAtTrigger(knex, "wa_message_receipts");

  await knex.schema.createTable("wa_baileys_auth_snapshots", (t) => {
    t.uuid("snapshot_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.bigInteger("snapshot_version").notNullable().defaultTo(1);
    t.jsonb("snapshot_payload").notNullable().defaultTo("{}");
    t.timestamp("persisted_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_account_id"], { indexName: "wa_baileys_auth_snapshots_tenant_account_uniq" });
  });
  await enableTenantIsolation(knex, "wa_baileys_auth_snapshots");
  await addUpdatedAtTrigger(knex, "wa_baileys_auth_snapshots");
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of ["wa_baileys_auth_snapshots", "wa_message_receipts"]) {
    await dropUpdatedAtTrigger(knex, tableName).catch(() => undefined);
    await disableTenantIsolation(knex, tableName).catch(() => undefined);
  }

  await knex.schema.dropTableIfExists("wa_baileys_auth_snapshots");
  await knex.schema.dropTableIfExists("wa_message_receipts");
  await knex.raw("ALTER TABLE wa_account_sessions ALTER COLUMN session_provider SET DEFAULT 'evolution'");
  await knex.raw("ALTER TABLE wa_accounts ALTER COLUMN provider_key SET DEFAULT 'evolution'");
}
