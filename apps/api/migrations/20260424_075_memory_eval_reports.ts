import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("memory_eval_datasets", (t) => {
    t.uuid("dataset_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("name", 160).notNullable();
    t.text("description");
    t.integer("sample_count").notNullable().defaultTo(0);
    t.jsonb("dataset_payload").notNullable().defaultTo("[]");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["tenant_id", "created_at"], "memory_eval_datasets_tenant_created_idx");
  });

  await knex.raw(`
    ALTER TABLE memory_eval_datasets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE memory_eval_datasets FORCE ROW LEVEL SECURITY;
    CREATE POLICY memory_eval_datasets_tenant_isolation ON memory_eval_datasets
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER memory_eval_datasets_set_updated_at
    BEFORE UPDATE ON memory_eval_datasets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("memory_eval_reports", (t) => {
    t.uuid("report_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("dataset_id").references("dataset_id").inTable("memory_eval_datasets").onDelete("SET NULL");
    t.string("name", 160).notNullable();
    t.string("status", 20).notNullable().defaultTo("completed");
    t.integer("sample_count").notNullable().defaultTo(0);
    t.jsonb("metrics").notNullable().defaultTo("{}");
    t.jsonb("report_payload").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["tenant_id", "created_at"], "memory_eval_reports_tenant_created_idx");
    t.index(["tenant_id", "dataset_id", "created_at"], "memory_eval_reports_dataset_created_idx");
  });

  await knex.raw(`
    ALTER TABLE memory_eval_reports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE memory_eval_reports FORCE ROW LEVEL SECURITY;
    CREATE POLICY memory_eval_reports_tenant_isolation ON memory_eval_reports
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(): Promise<void> {
  throw new Error("Memory eval report migration is intentionally not reversible.");
}
