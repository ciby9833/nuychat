/**
 * Legacy seed migration.
 *
 * The repository no longer provisions demo tenants or default credentials
 * during normal migrations. Keep this migration as a no-op so existing
 * migration history remains valid across environments.
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  void knex;
}

export async function down(knex: Knex): Promise<void> {
  void knex;
}
