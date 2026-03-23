import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS conversation_summaries_set_updated_at ON conversation_summaries");
  await knex.raw("DROP POLICY IF EXISTS conversation_summaries_tenant_isolation ON conversation_summaries");
  await knex.raw("DROP POLICY IF EXISTS working_memory_snapshots_tenant_isolation ON working_memory_snapshots");
  await knex.schema.dropTableIfExists("working_memory_snapshots");
  await knex.schema.dropTableIfExists("conversation_summaries");

  await knex.raw("DROP INDEX IF EXISTS customer_profile_indexes_search_vector_idx");
  await knex.raw("DROP INDEX IF EXISTS customer_profile_indexes_dirty_claim_idx");
  await knex.raw("DROP TRIGGER IF EXISTS customer_profile_indexes_refresh_search_vector ON customer_profile_indexes");
  await knex.raw("DROP TRIGGER IF EXISTS customer_profile_indexes_set_updated_at ON customer_profile_indexes");
  await knex.raw("DROP FUNCTION IF EXISTS refresh_customer_profile_index_search_vector()");
  await knex.raw("DROP POLICY IF EXISTS customer_profile_indexes_tenant_isolation ON customer_profile_indexes");
  await knex.schema.dropTableIfExists("customer_profile_indexes");

  await knex.schema.dropTableIfExists("dispatch_execution_candidates");
  await knex.schema.dropTableIfExists("dispatch_transitions");
  await knex.schema.dropTableIfExists("dispatch_executions");
}

export async function down(): Promise<void> {
  throw new Error("Legacy intelligence tables have been removed permanently; rollback is not supported.");
}
