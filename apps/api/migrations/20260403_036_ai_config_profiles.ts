import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_configs", (t) => {
    t.string("name", 120).notNullable().defaultTo("Default AI Config");
    t.boolean("is_default").notNullable().defaultTo(false);
    t.boolean("is_active").notNullable().defaultTo(true);
  });

  // Ensure each tenant has one default config (latest updated row wins).
  await knex.raw(`
    WITH ranked AS (
      SELECT
        config_id,
        tenant_id,
        ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY updated_at DESC, created_at DESC) AS rn
      FROM ai_configs
    )
    UPDATE ai_configs c
    SET is_default = (ranked.rn = 1)
    FROM ranked
    WHERE c.config_id = ranked.config_id
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX ai_configs_one_default_per_tenant
    ON ai_configs (tenant_id)
    WHERE is_default = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS ai_configs_one_default_per_tenant");
  await knex.schema.alterTable("ai_configs", (t) => {
    t.dropColumn("is_active");
    t.dropColumn("is_default");
    t.dropColumn("name");
  });
}
