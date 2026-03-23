import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenants", (t) => {
    t.integer("licensed_ai_seats").notNullable().defaultTo(0);
    t.string("ai_model_access_mode", 30).notNullable().defaultTo("platform_managed");
  });

  await knex.raw(`
    UPDATE tenants AS t
    SET ai_model_access_mode = CASE
      WHEN EXISTS (
        SELECT 1
        FROM ai_configs AS cfg
        WHERE cfg.tenant_id = t.tenant_id
          AND cfg.source = 'own'
      ) THEN 'tenant_managed'
      ELSE 'platform_managed'
    END
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenants", (t) => {
    t.dropColumn("ai_model_access_mode");
    t.dropColumn("licensed_ai_seats");
  });
}
