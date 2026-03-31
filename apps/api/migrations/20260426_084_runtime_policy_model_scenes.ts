import type { Knex } from "knex";

/**
 * 作用：为租户 AI 运行策略增加按场景选择模型配置的映射。
 * 影响页面：租户管理端「AI 配置 > AI 运行策略」。
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("tenant_ai_runtime_policies");
  if (!exists) return;

  const hasColumn = await knex.schema.hasColumn("tenant_ai_runtime_policies", "model_scene_config");
  if (!hasColumn) {
    await knex.schema.alterTable("tenant_ai_runtime_policies", (t: Knex.AlterTableBuilder) => {
      t.jsonb("model_scene_config").notNullable().defaultTo("{}");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("tenant_ai_runtime_policies");
  if (!exists) return;

  const hasColumn = await knex.schema.hasColumn("tenant_ai_runtime_policies", "model_scene_config");
  if (hasColumn) {
    await knex.schema.alterTable("tenant_ai_runtime_policies", (t: Knex.AlterTableBuilder) => {
      t.dropColumn("model_scene_config");
    });
  }
}
