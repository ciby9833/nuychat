/**
 * 作用:
 * - 为 WA 只读监控分析增加订阅目标、消息分析和回复事实表。
 *
 * 交互:
 * - 仅被 WA monitor 旁路读取与增量写入使用，不介入 WA 收发主链。
 */
import type { Knex } from "knex";

const TABLES = [
  "wa_conversation_reply_facts",
  "wa_message_monitor_analysis",
  "wa_monitor_targets"
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
  await knex.schema.createTable("wa_monitor_targets", (t) => {
    t.uuid("target_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.string("conversation_type", 20).notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.uuid("created_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamps(true, true);

    t.unique(["tenant_id", "wa_conversation_id"], { indexName: "wa_monitor_targets_tenant_conversation_uniq" });
    t.index(["tenant_id", "wa_account_id", "is_active"], "wa_monitor_targets_account_active_idx");
  });
  await enableTenantIsolation(knex, "wa_monitor_targets");
  await addUpdatedAtTrigger(knex, "wa_monitor_targets");

  await knex.schema.createTable("wa_message_monitor_analysis", (t) => {
    t.uuid("analysis_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.uuid("wa_message_id").notNullable().references("wa_message_id").inTable("wa_messages").onDelete("CASCADE");
    t.boolean("requires_reply").notNullable().defaultTo(false);
    t.text("reason");
    t.decimal("confidence", 5, 4).notNullable().defaultTo(0);
    t.string("model_provider", 40).notNullable().defaultTo("heuristic");
    t.string("model_name", 80).notNullable().defaultTo("wa-monitor-v1");
    t.integer("input_tokens").notNullable().defaultTo(0);
    t.integer("output_tokens").notNullable().defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(["tenant_id", "wa_message_id"], { indexName: "wa_msg_monitor_analysis_tenant_message_uniq" });
    t.index(["tenant_id", "wa_conversation_id", "created_at"], "wa_msg_monitor_analysis_conversation_idx");
    t.index(["tenant_id", "wa_account_id", "requires_reply", "created_at"], "wa_msg_monitor_analysis_account_reply_idx");
  });
  await enableTenantIsolation(knex, "wa_message_monitor_analysis");

  await knex.schema.createTable("wa_conversation_reply_facts", (t) => {
    t.uuid("fact_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("wa_account_id").notNullable().references("wa_account_id").inTable("wa_accounts").onDelete("CASCADE");
    t.uuid("wa_conversation_id").notNullable().references("wa_conversation_id").inTable("wa_conversations").onDelete("CASCADE");
    t.uuid("source_wa_message_id").notNullable().references("wa_message_id").inTable("wa_messages").onDelete("CASCADE");
    t.boolean("requires_reply").notNullable().defaultTo(false);
    t.timestamp("customer_message_at", { useTz: true }).notNullable();
    t.uuid("first_reply_wa_message_id").references("wa_message_id").inTable("wa_messages").onDelete("SET NULL");
    t.timestamp("first_reply_at", { useTz: true });
    t.uuid("replied_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.integer("reply_duration_sec");
    t.timestamps(true, true);

    t.unique(["tenant_id", "source_wa_message_id"], { indexName: "wa_reply_facts_tenant_source_uniq" });
    t.index(["tenant_id", "wa_account_id", "customer_message_at"], "wa_reply_facts_account_customer_at_idx");
    t.index(["tenant_id", "wa_conversation_id", "customer_message_at"], "wa_reply_facts_conversation_customer_at_idx");
    t.index(["tenant_id", "requires_reply", "first_reply_at"], "wa_reply_facts_reply_state_idx");
  });
  await enableTenantIsolation(knex, "wa_conversation_reply_facts");
  await addUpdatedAtTrigger(knex, "wa_conversation_reply_facts");
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of TABLES) {
    await dropUpdatedAtTrigger(knex, tableName).catch(() => undefined);
    await disableTenantIsolation(knex, tableName).catch(() => undefined);
  }
  await knex.schema.dropTableIfExists("wa_conversation_reply_facts");
  await knex.schema.dropTableIfExists("wa_message_monitor_analysis");
  await knex.schema.dropTableIfExists("wa_monitor_targets");
}
