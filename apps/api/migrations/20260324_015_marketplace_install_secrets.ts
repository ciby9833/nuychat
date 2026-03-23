import type { Knex } from "knex";

/**
 * Deprecated placeholder migration.
 *
 * This file is kept to preserve migration history consistency for environments
 * that already recorded batch 12.
 */
export async function up(_knex: Knex): Promise<void> {
  // no-op
}

export async function down(_knex: Knex): Promise<void> {
  // no-op
}
