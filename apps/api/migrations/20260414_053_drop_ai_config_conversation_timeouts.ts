import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE ai_configs DROP COLUMN IF EXISTS frt_timeout_minutes");
  await knex.raw("ALTER TABLE ai_configs DROP COLUMN IF EXISTS idle_timeout_minutes");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS idle_timeout_minutes integer");
  await knex.raw("ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS frt_timeout_minutes integer");
}
