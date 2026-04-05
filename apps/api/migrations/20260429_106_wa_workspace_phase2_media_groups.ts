/**
 * 作用:
 * - 为 WA Workspace Phase 2 补充群成员、附件、reaction、消息缺口表。
 *
 * 交互:
 * - 群聊成员同步依赖 wa_conversation_members。
 * - 富媒体消息依赖 wa_message_attachments / wa_message_reactions。
 * - 后续补偿链路依赖 wa_message_gaps。
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
  await knex.schema.createTable("wa_conversation_members", (t) => {
    t.uuid("member_row_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.string("participant_jid", 191).notNullable();
    t.string("participant_type", 32).notNullable().defaultTo("group_member");
    t.string("display_name", 255);
    t.boolean("is_admin").notNullable().defaultTo(false);
    t.timestamp("joined_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("left_at", { useTz: true });
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_conversation_id", "participant_jid"], { indexName: "wa_conversation_members_uniq" });
  });
  await enableTenantIsolation(knex, "wa_conversation_members");
  await addUpdatedAtTrigger(knex, "wa_conversation_members");

  await knex.schema.createTable("wa_message_attachments", (t) => {
    t.uuid("attachment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_message_id").notNullable().references("wa_message_id").inTable("wa_messages").onDelete("CASCADE");
    t.string("attachment_type", 32).notNullable();
    t.string("mime_type", 120);
    t.string("file_name", 255);
    t.bigInteger("file_size");
    t.integer("width");
    t.integer("height");
    t.integer("duration_ms");
    t.string("storage_url", 500);
    t.string("preview_url", 500);
    t.string("sha256", 160);
    t.jsonb("provider_payload").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.index(["tenant_id", "wa_message_id"], "wa_message_attachments_message_idx");
  });
  await enableTenantIsolation(knex, "wa_message_attachments");
  await addUpdatedAtTrigger(knex, "wa_message_attachments");

  await knex.schema.createTable("wa_message_reactions", (t) => {
    t.uuid("reaction_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_message_id").notNullable().references("wa_message_id").inTable("wa_messages").onDelete("CASCADE");
    t.string("actor_jid", 191);
    t.uuid("actor_member_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.string("emoji", 32).notNullable();
    t.bigInteger("provider_ts");
    t.timestamps(true, true);

    t.index(["tenant_id", "wa_message_id"], "wa_message_reactions_message_idx");
  });
  await enableTenantIsolation(knex, "wa_message_reactions");
  await addUpdatedAtTrigger(knex, "wa_message_reactions");

  await knex.schema.createTable("wa_message_gaps", (t) => {
    t.uuid("gap_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.string("gap_reason", 80).notNullable();
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.string("status", 32).notNullable().defaultTo("open");
    t.timestamps(true, true);
  });
  await enableTenantIsolation(knex, "wa_message_gaps");
  await addUpdatedAtTrigger(knex, "wa_message_gaps");
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of ["wa_message_gaps", "wa_message_reactions", "wa_message_attachments", "wa_conversation_members"]) {
    await dropUpdatedAtTrigger(knex, tableName).catch(() => undefined);
    await disableTenantIsolation(knex, tableName).catch(() => undefined);
  }

  await knex.schema.dropTableIfExists("wa_message_gaps");
  await knex.schema.dropTableIfExists("wa_message_reactions");
  await knex.schema.dropTableIfExists("wa_message_attachments");
  await knex.schema.dropTableIfExists("wa_conversation_members");
}
