import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
    $$ LANGUAGE SQL STABLE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
      SELECT current_setting('app.current_tenant_id', true)::UUID;
    $$ LANGUAGE SQL STABLE;
  `);
}
