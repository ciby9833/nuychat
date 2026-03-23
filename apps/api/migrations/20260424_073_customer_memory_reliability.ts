import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("customer_memory_profiles", (t) => {
    t.string("index_status", 20).notNullable().defaultTo("pending");
    t.integer("index_attempt_count").notNullable().defaultTo(0);
    t.text("index_last_error");
    t.timestamp("next_retry_at", { useTz: true });
  });

  await knex.raw(`
    UPDATE customer_memory_profiles
    SET index_status = CASE
      WHEN indexed_version >= source_version THEN 'indexed'
      ELSE 'pending'
    END
  `);

  await knex.raw(`
    CREATE INDEX customer_memory_profiles_retry_idx
    ON customer_memory_profiles (tenant_id, index_status, next_retry_at, claimed_at)
  `);

  await knex.schema.alterTable("customer_memory_units", (t) => {
    t.integer("index_attempt_count").notNullable().defaultTo(0);
    t.text("index_last_error");
    t.timestamp("next_retry_at", { useTz: true });
  });

  await knex.raw(`
    CREATE INDEX customer_memory_units_retry_idx
    ON customer_memory_units (tenant_id, index_status, next_retry_at, updated_at)
  `);

  await knex.schema.createTable("memory_recall_traces", (t) => {
    t.uuid("trace_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.text("query_text").notNullable().defaultTo("");
    t.string("retrieval_scope", 40).notNullable().defaultTo("customer_memory_context");
    t.jsonb("lexical_hits").notNullable().defaultTo("[]");
    t.jsonb("vector_hits").notNullable().defaultTo("[]");
    t.jsonb("selected_hits").notNullable().defaultTo("[]");
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["tenant_id", "conversation_id", "created_at"], "memory_recall_traces_conversation_idx");
    t.index(["tenant_id", "customer_id", "created_at"], "memory_recall_traces_customer_idx");
  });

  await knex.raw(`
    ALTER TABLE memory_recall_traces ENABLE ROW LEVEL SECURITY;
    ALTER TABLE memory_recall_traces FORCE ROW LEVEL SECURITY;
    CREATE POLICY memory_recall_traces_tenant_isolation ON memory_recall_traces
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(): Promise<void> {
  throw new Error("Customer memory reliability migration is intentionally not reversible.");
}
