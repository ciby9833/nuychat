import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex("capability_availability")
    .where({ role: "ai", channel: null, module_id: null, owner_mode: null, enabled: true })
    .update({ role: null });
}

export async function down(knex: Knex): Promise<void> {
  await knex("capability_availability")
    .whereNull("role")
    .whereNull("channel")
    .whereNull("module_id")
    .whereNull("owner_mode")
    .andWhere("enabled", true)
    .update({ role: "ai" });
}
