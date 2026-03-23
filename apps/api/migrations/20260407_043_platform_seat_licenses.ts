import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenants", (t) => {
    t.integer("licensed_seats").nullable();
  });

  await knex.raw(`
    UPDATE tenants AS t
    SET licensed_seats = p.max_agents
    FROM tenant_plans AS p
    WHERE p.plan_id = t.plan_id
      AND t.licensed_seats IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenants", (t) => {
    t.dropColumn("licensed_seats");
  });
}
