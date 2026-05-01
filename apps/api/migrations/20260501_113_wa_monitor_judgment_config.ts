/**
 * 作用:
 * - 为 WA 监控的“是否需要回复”判断增加租户级 AI 判断配置。
 *
 * 交互:
 * - WA 消息增量分析读取该配置构造 AI 判断提示词。
 */
import type { Knex } from "knex";

const TABLE_NAME = "wa_monitor_judgment_configs";

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
  await knex.schema.createTable(TABLE_NAME, (t) => {
    t.uuid("config_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.boolean("is_enabled").notNullable().defaultTo(true);
    t.text("judgment_prompt").notNullable();
    t.text("condition_text").notNullable();
    t.uuid("created_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamps(true, true);

    t.unique(["tenant_id"], { indexName: "wa_monitor_judgment_configs_tenant_uniq" });
  });
  await enableTenantIsolation(knex, TABLE_NAME);
  await addUpdatedAtTrigger(knex, TABLE_NAME);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdatedAtTrigger(knex, TABLE_NAME).catch(() => undefined);
  await disableTenantIsolation(knex, TABLE_NAME).catch(() => undefined);
  await knex.schema.dropTableIfExists(TABLE_NAME);
}
