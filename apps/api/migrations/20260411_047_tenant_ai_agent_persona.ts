import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenant_ai_agents", (t) => {
    t.string("role_label", 120);
    t.text("personality");
    t.text("scene_prompt");
    t.text("system_prompt");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenant_ai_agents", (t) => {
    t.dropColumn("system_prompt");
    t.dropColumn("scene_prompt");
    t.dropColumn("personality");
    t.dropColumn("role_label");
  });
}
