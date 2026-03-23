import type { Knex } from "knex";

type TenantRow = {
  tenant_id: string;
};

type ReleaseRow = {
  release_id: string;
  skill_id: string;
};

export async function up(knex: Knex): Promise<void> {
  const tenants = await knex("tenants")
    .select("tenant_id") as TenantRow[];

  const releases = await knex("marketplace_skill_releases as r")
    .join("marketplace_skills as s", "s.skill_id", "r.skill_id")
    .where({ "s.tier": "official", "r.is_active": true })
    .select("r.release_id", "r.skill_id") as ReleaseRow[];

  for (const tenant of tenants) {
    for (const release of releases) {
      await knex("marketplace_skill_installs")
        .insert({
          tenant_id: tenant.tenant_id,
          skill_id: release.skill_id,
          release_id: release.release_id,
          status: "active",
          enabled_for_ai: true,
          enabled_for_agent: true,
          ai_whitelisted: true,
          rate_limit_per_minute: 60,
          enabled_modules: JSON.stringify([]),
          enabled_skill_groups: JSON.stringify([])
        })
        .onConflict(["tenant_id", "skill_id"])
        .merge({
          release_id: release.release_id,
          status: "active",
          enabled_for_ai: true,
          enabled_for_agent: true,
          ai_whitelisted: true,
          rate_limit_per_minute: 60,
          updated_at: knex.fn.now()
        });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const officialSkillIds = await knex("marketplace_skills")
    .where({ tier: "official" })
    .pluck("skill_id");

  if (officialSkillIds.length === 0) {
    return;
  }

  await knex("marketplace_skill_installs")
    .whereIn("skill_id", officialSkillIds)
    .delete();
}
