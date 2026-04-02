import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await knex.raw(`
    CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
    $$ LANGUAGE SQL STABLE;
  `);
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
    ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
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

  await knex.raw(`
    ALTER TABLE ai_configs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_configs FORCE ROW LEVEL SECURITY;
    CREATE POLICY ai_configs_tenant_isolation ON ai_configs
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.schema.createTable("channel_configs", (t) => {
    t.uuid("config_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("channel_type", 30).notNullable();
    t.string("channel_id", 100).notNullable().unique();
    t.text("encrypted_config").notNullable();
    t.boolean("is_active").defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE channel_configs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE channel_configs FORCE ROW LEVEL SECURITY;
    CREATE POLICY channel_configs_tenant_isolation ON channel_configs
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
  await knex.raw(`
    CREATE OR REPLACE FUNCTION find_channel_config_by_channel_id(input_channel_id TEXT)
    RETURNS TABLE (
      config_id UUID,
      tenant_id UUID,
      channel_type VARCHAR(30),
      channel_id VARCHAR(100),
      encrypted_config TEXT,
      is_active BOOLEAN
    ) AS $$
      SELECT
        cc.config_id,
        cc.tenant_id,
        cc.channel_type,
        cc.channel_id,
        cc.encrypted_config,
        cc.is_active
      FROM channel_configs cc
      WHERE cc.channel_id = input_channel_id
      LIMIT 1;
    $$ LANGUAGE SQL SECURITY DEFINER;
  `);

  await knex.schema.createTable("tenant_configs", (t) => {
    t.uuid("config_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("key", 100).notNullable();
    t.jsonb("value").notNullable();
    t.unique(["tenant_id", "key"]);
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE tenant_configs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_configs FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_configs_tenant_isolation ON tenant_configs
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP POLICY IF EXISTS tenant_configs_tenant_isolation ON tenant_configs");
  await knex.schema.raw("DROP POLICY IF EXISTS channel_configs_tenant_isolation ON channel_configs");
  await knex.schema.raw("DROP POLICY IF EXISTS ai_configs_tenant_isolation ON ai_configs");
  await knex.raw("DROP FUNCTION IF EXISTS find_channel_config_by_channel_id(TEXT)");
  await knex.schema.dropTableIfExists("tenant_configs");
  await knex.schema.dropTableIfExists("channel_configs");
  await knex.schema.dropTableIfExists("ai_configs");
  await knex.schema.raw("DROP POLICY IF EXISTS tenant_isolation ON tenants");
  await knex.schema.dropTableIfExists("tenants");
  await knex.schema.dropTableIfExists("tenant_plans");
}
