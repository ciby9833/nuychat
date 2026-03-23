import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("memory_encoder_traces", (t) => {
    t.uuid("trace_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.uuid("task_id").references("task_id").inTable("async_tasks").onDelete("SET NULL");
    t.string("source_kind", 20).notNullable();
    t.string("status", 20).notNullable().defaultTo("completed");
    t.jsonb("input_context").notNullable().defaultTo("{}");
    t.jsonb("event_frame").notNullable().defaultTo("{}");
    t.jsonb("candidate_items").notNullable().defaultTo("[]");
    t.jsonb("reviewed_items").notNullable().defaultTo("[]");
    t.jsonb("final_items").notNullable().defaultTo("[]");
    t.jsonb("metrics").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["tenant_id", "conversation_id", "created_at"], "memory_encoder_traces_conversation_idx");
    t.index(["tenant_id", "customer_id", "created_at"], "memory_encoder_traces_customer_idx");
    t.index(["tenant_id", "source_kind", "created_at"], "memory_encoder_traces_kind_idx");
  });

  await knex.raw(`
    ALTER TABLE memory_encoder_traces ENABLE ROW LEVEL SECURITY;
    ALTER TABLE memory_encoder_traces FORCE ROW LEVEL SECURITY;
    CREATE POLICY memory_encoder_traces_tenant_isolation ON memory_encoder_traces
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(): Promise<void> {
  throw new Error("Memory encoder trace migration is intentionally not reversible.");
}
