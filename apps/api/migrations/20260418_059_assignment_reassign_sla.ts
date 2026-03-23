import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE sla_policies
    ADD COLUMN IF NOT EXISTS assignment_reassign_after_sec integer
  `);

  await knex.raw(`
    UPDATE sla_policies
    SET assignment_reassign_after_sec = first_response_target_sec
    WHERE assignment_reassign_after_sec IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE sla_policies
    DROP COLUMN IF EXISTS assignment_reassign_after_sec
  `);
}
