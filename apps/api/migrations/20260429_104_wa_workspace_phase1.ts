// WhatsApp 模拟官方web登录数据库脚本
/**
 * 作用:
 * - 初始化 WA Workspace Phase 1 的核心表结构。
 *
 * 交互:
 * - 支撑 WA 账号池、登录任务、会话、消息、接管锁、出站任务。
 * - 所有表都启用 tenant RLS，避免跨租户读写。
 */
import type { Knex } from "knex";

const TABLES = [
  "wa_outbound_jobs",
  "wa_assignment_history",
  "wa_assignment_locks",
  "wa_message_raw_events",
  "wa_messages",
  "wa_conversations",
  "wa_login_tasks",
  "wa_account_members",
  "wa_account_sessions",
  "wa_accounts"
] as const;

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
  await knex.schema.createTable("wa_accounts", (t) => {
    t.uuid("wa_account_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("instance_key", 120).notNullable();
    t.string("phone_e164", 32);
    t.string("display_name", 160).notNullable();
    t.string("provider_key", 40).notNullable().defaultTo("evolution");
    t.string("account_status", 32).notNullable().defaultTo("pending_login");
    t.string("risk_level", 20).notNullable().defaultTo("normal");
    t.uuid("primary_owner_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamp("last_connected_at", { useTz: true });
    t.timestamp("last_disconnected_at", { useTz: true });
    t.jsonb("provider_config").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.unique(["tenant_id", "instance_key"], { indexName: "wa_accounts_tenant_instance_key_uniq" });
    t.index(["tenant_id", "account_status"], "wa_accounts_tenant_status_idx");
  });
  await enableTenantIsolation(knex, "wa_accounts");
  await addUpdatedAtTrigger(knex, "wa_accounts");

  await knex.schema.createTable("wa_account_sessions", (t) => {
    t.uuid("session_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.string("session_provider", 40).notNullable().defaultTo("evolution");
    t.string("session_ref", 160);
    t.string("connection_state", 32).notNullable().defaultTo("qr_required");
    t.string("login_mode", 32).notNullable().defaultTo("employee_scan");
    t.timestamp("last_qr_at", { useTz: true });
    t.timestamp("heartbeat_at", { useTz: true });
    t.text("disconnect_reason");
    t.integer("auto_reconnect_count").notNullable().defaultTo(0);
    t.jsonb("session_meta").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.index(["tenant_id", "wa_account_id"], "wa_account_sessions_tenant_account_idx");
  });
  await enableTenantIsolation(knex, "wa_account_sessions");
  await addUpdatedAtTrigger(knex, "wa_account_sessions");

  await knex.schema.createTable("wa_account_members", (t) => {
    t.uuid("account_member_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("membership_id").notNullable().references("membership_id").inTable("tenant_memberships").onDelete("CASCADE");
    t.string("member_role", 32).notNullable().defaultTo("collaborator");
    t.string("scope", 32).notNullable().defaultTo("account_all");
    t.boolean("is_default_owner").notNullable().defaultTo(false);
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_account_id", "membership_id"], { indexName: "wa_account_members_uniq" });
    t.index(["tenant_id", "membership_id"], "wa_account_members_tenant_membership_idx");
  });
  await enableTenantIsolation(knex, "wa_account_members");
  await addUpdatedAtTrigger(knex, "wa_account_members");

  await knex.schema.createTable("wa_login_tasks", (t) => {
    t.uuid("login_task_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("requested_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.string("login_mode", 32).notNullable();
    t.string("task_status", 32).notNullable().defaultTo("pending");
    t.text("qr_code");
    t.string("session_ref", 160);
    t.timestamp("expires_at", { useTz: true });
    t.timestamp("completed_at", { useTz: true });
    t.jsonb("provider_payload").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.index(["tenant_id", "wa_account_id", "task_status"], "wa_login_tasks_tenant_account_status_idx");
  });
  await enableTenantIsolation(knex, "wa_login_tasks");
  await addUpdatedAtTrigger(knex, "wa_login_tasks");

  await knex.schema.createTable("wa_conversations", (t) => {
    t.uuid("wa_conversation_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.string("chat_jid", 160).notNullable();
    t.string("conversation_type", 20).notNullable().defaultTo("direct");
    t.string("subject", 255);
    t.string("contact_jid", 160);
    t.string("conversation_status", 20).notNullable().defaultTo("active");
    t.uuid("current_replier_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.integer("reply_lock_version").notNullable().defaultTo(0);
    t.timestamp("last_message_at", { useTz: true });
    t.string("last_message_id", 160);
    t.bigInteger("message_cursor").notNullable().defaultTo(0);
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_account_id", "chat_jid"], { indexName: "wa_conversations_tenant_account_chat_uniq" });
    t.index(["tenant_id", "wa_account_id", "last_message_at"], "wa_conversations_tenant_account_last_msg_idx");
  });
  await enableTenantIsolation(knex, "wa_conversations");
  await addUpdatedAtTrigger(knex, "wa_conversations");

  await knex.schema.createTable("wa_messages", (t) => {
    t.uuid("wa_message_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.string("provider_message_id", 191);
    t.string("message_type", 32).notNullable().defaultTo("text");
    t.string("message_scene", 32).notNullable().defaultTo("external_chat");
    t.string("direction", 16).notNullable();
    t.string("sender_jid", 191);
    t.uuid("sender_member_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.string("sender_role", 20).notNullable();
    t.string("participant_jid", 191);
    t.string("quoted_message_id", 191);
    t.text("body_text");
    t.jsonb("body_rich").notNullable().defaultTo("{}");
    t.jsonb("provider_payload").notNullable().defaultTo("{}");
    t.bigInteger("provider_ts");
    t.bigInteger("logical_seq").notNullable();
    t.timestamp("server_received_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.string("delivery_status", 20).notNullable().defaultTo("pending");
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_account_id", "provider_message_id"], {
      indexName: "wa_messages_tenant_account_provider_msg_uniq",
      useConstraint: false
    });
    t.index(["tenant_id", "wa_conversation_id", "logical_seq"], "wa_messages_tenant_conversation_seq_idx");
  });
  await enableTenantIsolation(knex, "wa_messages");
  await addUpdatedAtTrigger(knex, "wa_messages");

  await knex.schema.createTable("wa_message_raw_events", (t) => {
    t.uuid("raw_event_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.string("provider_event_type", 80).notNullable();
    t.string("provider_event_key", 191).notNullable();
    t.bigInteger("provider_ts");
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.timestamp("ingested_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("processed_at", { useTz: true });
    t.string("process_status", 20).notNullable().defaultTo("pending");
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_account_id", "provider_event_key"], { indexName: "wa_message_raw_events_uniq" });
  });
  await enableTenantIsolation(knex, "wa_message_raw_events");
  await addUpdatedAtTrigger(knex, "wa_message_raw_events");

  await knex.schema.createTable("wa_assignment_locks", (t) => {
    t.uuid("lock_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.uuid("active_membership_id").notNullable().references("membership_id").inTable("tenant_memberships").onDelete("CASCADE");
    t.string("lock_status", 32).notNullable().defaultTo("active");
    t.boolean("allow_comment_only").notNullable().defaultTo(true);
    t.timestamp("expires_at", { useTz: true });
    t.uuid("updated_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_conversation_id"], { indexName: "wa_assignment_locks_tenant_conversation_uniq" });
  });
  await enableTenantIsolation(knex, "wa_assignment_locks");
  await addUpdatedAtTrigger(knex, "wa_assignment_locks");

  await knex.schema.createTable("wa_assignment_history", (t) => {
    t.uuid("assignment_event_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.string("event_type", 32).notNullable();
    t.uuid("from_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.uuid("to_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.uuid("acted_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.text("reason");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "wa_conversation_id", "created_at"], "wa_assignment_history_tenant_conversation_created_idx");
  });
  await enableTenantIsolation(knex, "wa_assignment_history");

  await knex.schema.createTable("wa_outbound_jobs", (t) => {
    t.uuid("job_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.uuid("created_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.string("client_message_id", 191).notNullable();
    t.string("job_type", 32).notNullable().defaultTo("send_text");
    t.string("send_status", 20).notNullable().defaultTo("queued");
    t.timestamp("send_after", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer("attempt_count").notNullable().defaultTo(0);
    t.text("last_error");
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_conversation_id", "client_message_id"], { indexName: "wa_outbound_jobs_client_msg_uniq" });
    t.index(["tenant_id", "wa_account_id", "send_status", "send_after"], "wa_outbound_jobs_dispatch_idx");
  });
  await enableTenantIsolation(knex, "wa_outbound_jobs");
  await addUpdatedAtTrigger(knex, "wa_outbound_jobs");
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of TABLES) {
    await dropUpdatedAtTrigger(knex, tableName).catch(() => undefined);
    await disableTenantIsolation(knex, tableName).catch(() => undefined);
  }

  await knex.schema.dropTableIfExists("wa_outbound_jobs");
  await knex.schema.dropTableIfExists("wa_assignment_history");
  await knex.schema.dropTableIfExists("wa_assignment_locks");
  await knex.schema.dropTableIfExists("wa_message_raw_events");
  await knex.schema.dropTableIfExists("wa_messages");
  await knex.schema.dropTableIfExists("wa_conversations");
  await knex.schema.dropTableIfExists("wa_login_tasks");
  await knex.schema.dropTableIfExists("wa_account_members");
  await knex.schema.dropTableIfExists("wa_account_sessions");
  await knex.schema.dropTableIfExists("wa_accounts");
}
