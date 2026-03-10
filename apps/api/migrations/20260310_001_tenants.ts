import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tenant_plans", (t) => {
    t.uuid("plan_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("code", 50).notNullable().unique();
    t.string("name", 100).notNullable();
    t.integer("max_agents").defaultTo(10);
    t.integer("max_monthly_conversations").defaultTo(10000);
    t.integer("ai_token_quota_monthly").defaultTo(1000000);
    t.jsonb("features").defaultTo("[]");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("tenants", (t) => {
    t.uuid("tenant_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("plan_id").references("plan_id").inTable("tenant_plans");
    t.string("name", 200).notNullable();
    t.string("slug", 100).notNullable().unique();
    t.string("status", 20).defaultTo("active");
    t.string("operating_mode", 30).defaultTo("ai_first");
    t.integer("ai_quota_used").defaultTo(0);
    t.jsonb("settings").defaultTo("{}");
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON tenants
      USING (tenant_id = current_tenant_id());
  `);

  await knex.schema.createTable("ai_configs", (t) => {
    t.uuid("config_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("source", 20).defaultTo("platform");
    t.string("provider", 30).defaultTo("openai");
    t.string("model", 100).defaultTo("gpt-4o-mini");
    t.text("encrypted_api_key");
    t.boolean("can_override").defaultTo(true);
    t.jsonb("quotas").defaultTo("{}");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("channel_configs", (t) => {
    t.uuid("config_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("channel_type", 30).notNullable();
    t.string("channel_id", 100).notNullable().unique();
    t.text("encrypted_config").notNullable();
    t.boolean("is_active").defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("tenant_configs", (t) => {
    t.uuid("config_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("key", 100).notNullable();
    t.jsonb("value").notNullable();
    t.unique(["tenant_id", "key"]);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tenant_configs");
  await knex.schema.dropTableIfExists("channel_configs");
  await knex.schema.dropTableIfExists("ai_configs");
  await knex.schema.raw("DROP POLICY IF EXISTS tenant_isolation ON tenants");
  await knex.schema.dropTableIfExists("tenants");
  await knex.schema.dropTableIfExists("tenant_plans");
}

