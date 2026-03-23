import type { Knex } from "knex";

export async function up(_: Knex): Promise<void> {
  // Historical placeholder.
  // Dispatch audit tables are ensured by later migrations.
}

export async function down(_: Knex): Promise<void> {
  // No-op placeholder.
}
