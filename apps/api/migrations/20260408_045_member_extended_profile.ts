import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenant_memberships", (t) => {
    t.string("phone", 30).nullable();
    t.string("id_number", 60).nullable();
    t.timestamp("resigned_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenant_memberships", (t) => {
    t.dropColumn("resigned_at");
    t.dropColumn("id_number");
    t.dropColumn("phone");
  });
}
