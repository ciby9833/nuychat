import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("billing_cycles", (t) => {
    t.uuid("cycle_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.date("period_start").notNullable();
    t.date("period_end").notNullable();
    t.string("status", 20).notNullable().defaultTo("closed");
    t.timestamp("closed_at", { useTz: true });
    t.uuid("closed_by_identity_id").references("identity_id").inTable("identities").onDelete("RESTRICT");
    t.timestamps(true, true);

    t.unique(["tenant_id", "period_start", "period_end"], "billing_cycles_tenant_period_uniq");
    t.index(["status", "period_end"], "billing_cycles_status_period_end_idx");
    t.index(["tenant_id", "period_start"], "billing_cycles_tenant_period_start_idx");
  });

  await knex.schema.createTable("billing_invoices", (t) => {
    t.uuid("invoice_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("cycle_id").notNullable().references("cycle_id").inTable("billing_cycles").onDelete("CASCADE");
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("invoice_no", 60).notNullable().unique();
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.decimal("amount_due", 18, 2).notNullable().defaultTo(0);
    t.decimal("amount_paid", 18, 2).notNullable().defaultTo(0);
    t.string("status", 20).notNullable().defaultTo("issued");
    t.timestamp("issued_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("due_at", { useTz: true });
    t.timestamp("paid_at", { useTz: true });
    t.jsonb("meta").notNullable().defaultTo("{}");
    t.timestamps(true, true);

    t.unique(["cycle_id"], "billing_invoices_cycle_uniq");
    t.index(["tenant_id", "status"], "billing_invoices_tenant_status_idx");
    t.index(["status", "due_at"], "billing_invoices_status_due_idx");
  });

  await knex.schema.createTable("billing_payments", (t) => {
    t.uuid("payment_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("invoice_id").notNullable().references("invoice_id").inTable("billing_invoices").onDelete("CASCADE");
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.decimal("amount", 18, 2).notNullable();
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.string("method", 40).notNullable();
    t.string("reference_no", 120);
    t.timestamp("received_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid("reconciled_by_identity_id").references("identity_id").inTable("identities").onDelete("RESTRICT");
    t.string("note", 300);
    t.timestamps(true, true);

    t.index(["invoice_id", "received_at"], "billing_payments_invoice_received_idx");
    t.index(["tenant_id", "received_at"], "billing_payments_tenant_received_idx");
  });

  await knex.raw(`
    CREATE TRIGGER billing_cycles_set_updated_at
    BEFORE UPDATE ON billing_cycles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE TRIGGER billing_invoices_set_updated_at
    BEFORE UPDATE ON billing_invoices
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE TRIGGER billing_payments_set_updated_at
    BEFORE UPDATE ON billing_payments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS billing_payments_set_updated_at ON billing_payments");
  await knex.raw("DROP TRIGGER IF EXISTS billing_invoices_set_updated_at ON billing_invoices");
  await knex.raw("DROP TRIGGER IF EXISTS billing_cycles_set_updated_at ON billing_cycles");

  await knex.schema.dropTableIfExists("billing_payments");
  await knex.schema.dropTableIfExists("billing_invoices");
  await knex.schema.dropTableIfExists("billing_cycles");
}
