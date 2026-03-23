import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS idle_close_after_sec integer");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE sla_policies DROP COLUMN IF EXISTS idle_close_after_sec");
}
