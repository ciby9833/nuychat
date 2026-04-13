import type { Knex } from "knex";

/**
 * 作用：为 capability 版本补齐 trigger hints 持久化字段，并把旧 tenant_skills 数据回填到最新版本。
 * 上游：capabilities/capability-definition.service.ts
 * 下游：agent-skills/skill-definition.service.ts、skill-planner.service.ts
 * 协作对象：capability_versions、tenant_skills
 * 不负责：不改 skill 规划算法，不处理其他 capability 元数据迁移。
 * 变更注意：只做最小字段补齐和回填，避免把 P1-2 扩展成更大数据模型重构。
 */

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("capability_versions", "trigger_hints_json");
  if (!hasColumn) {
    await knex.schema.alterTable("capability_versions", (t) => {
      t.jsonb("trigger_hints_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    });
  }

  const hasTenantSkills = await knex.schema.hasTable("tenant_skills");
  if (!hasTenantSkills) return;

  const rows = await knex("capabilities as c")
    .join("tenant_skills as s", "s.tenant_skill_id", "c.capability_id")
    .select("c.capability_id", "s.trigger_hints");

  for (const row of rows as Array<{ capability_id: string; trigger_hints: unknown }>) {
    const latestVersion = await knex("capability_versions")
      .where({ capability_id: row.capability_id })
      .orderBy([{ column: "version_no", order: "desc" }, { column: "created_at", order: "desc" }])
      .first("version_id");

    if (!latestVersion?.version_id) continue;

    await knex("capability_versions")
      .where({ version_id: latestVersion.version_id })
      .update({
        trigger_hints_json: row.trigger_hints ?? knex.raw("'{}'::jsonb")
      });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("capability_versions", "trigger_hints_json");
  if (!hasColumn) return;

  await knex.schema.alterTable("capability_versions", (t) => {
    t.dropColumn("trigger_hints_json");
  });
}
