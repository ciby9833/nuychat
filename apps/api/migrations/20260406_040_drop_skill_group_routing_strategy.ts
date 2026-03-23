import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("skill_groups", (t) => {
    t.dropColumn("routing_strategy");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("skill_groups", (t) => {
    t.string("routing_strategy", 30).notNullable().defaultTo("least_busy");
  });
}
