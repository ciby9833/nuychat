import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tenant_ai_budget_policies", (t) => {
    t.uuid("policy_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE").unique();
    t.bigInteger("included_tokens").notNullable().defaultTo(0);
    t.decimal("monthly_budget_usd", 14, 4).nullable();
    t.decimal("soft_limit_usd", 14, 4).nullable();
    t.decimal("hard_limit_usd", 14, 4).nullable();
    t.string("enforcement_mode", 20).notNullable().defaultTo("notify");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ai_usage_ledger", (t) => {
    t.uuid("usage_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("provider", 40).notNullable();
    t.string("model", 120).notNullable();
    t.string("feature", 40).notNullable();
    t.integer("request_count").notNullable().defaultTo(1);
    t.bigInteger("input_tokens").notNullable().defaultTo(0);
    t.bigInteger("output_tokens").notNullable().defaultTo(0);
    t.bigInteger("total_tokens").notNullable().defaultTo(0);
    t.decimal("estimated_cost_usd", 14, 6).notNullable().defaultTo(0);
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable("billing_invoices", (t) => {
    t.decimal("seat_license_amount", 14, 4).notNullable().defaultTo(0);
    t.decimal("ai_usage_amount", 14, 4).notNullable().defaultTo(0);
  });

  await knex.raw(`
    INSERT INTO tenant_ai_budget_policies (
      tenant_id,
      included_tokens,
      monthly_budget_usd,
      soft_limit_usd,
      hard_limit_usd,
      enforcement_mode,
      is_active
    )
    SELECT
      t.tenant_id,
      COALESCE(NULLIF((cfg.quotas ->> 'aiTokenQuotaMonthly')::bigint, 0), NULLIF((cfg.quotas ->> 'monthlyTokenLimit')::bigint, 0), 0),
      NULL,
      NULL,
      NULL,
      'notify',
      true
    FROM tenants AS t
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN ai.quotas IS NULL THEN '{}'::jsonb
          WHEN jsonb_typeof(ai.quotas::jsonb) = 'object' THEN ai.quotas::jsonb
          ELSE '{}'::jsonb
        END AS quotas
      FROM ai_configs AS ai
      WHERE ai.tenant_id = t.tenant_id
      ORDER BY ai.is_default DESC, ai.updated_at DESC
      LIMIT 1
    ) AS cfg ON true
    ON CONFLICT (tenant_id) DO NOTHING;
  `);

  await knex.schema.alterTable("ai_usage_ledger", (t) => {
    t.index(["tenant_id", "occurred_at"], "idx_ai_usage_ledger_tenant_occurred_at");
    t.index(["provider", "model", "occurred_at"], "idx_ai_usage_ledger_model_occurred_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("billing_invoices", (t) => {
    t.dropColumn("seat_license_amount");
    t.dropColumn("ai_usage_amount");
  });

  await knex.schema.dropTableIfExists("ai_usage_ledger");
  await knex.schema.dropTableIfExists("tenant_ai_budget_policies");
}
