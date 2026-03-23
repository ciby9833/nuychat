import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("marketplace_skill_installs");
  if (!exists) return;

  await knex.schema.alterTable("marketplace_skill_installs", (t) => {
    t.jsonb("enabled_modules").notNullable().defaultTo("[]");
    t.jsonb("enabled_skill_groups").notNullable().defaultTo("[]");
    t.boolean("enabled_for_ai").notNullable().defaultTo(true);
    t.boolean("enabled_for_agent").notNullable().defaultTo(true);
    t.integer("rate_limit_per_minute").notNullable().defaultTo(60);
  });
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("marketplace_skill_installs");
  if (!exists) return;

  await knex.schema.alterTable("marketplace_skill_installs", (t) => {
    t.dropColumn("rate_limit_per_minute");
    t.dropColumn("enabled_for_agent");
    t.dropColumn("enabled_for_ai");
    t.dropColumn("enabled_skill_groups");
    t.dropColumn("enabled_modules");
  });
}
