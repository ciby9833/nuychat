export async function up(knex: import("knex").Knex): Promise<void> {
  const hasRequirementsJson = await knex.schema.hasColumn("capability_scripts", "requirements_json");
  if (!hasRequirementsJson) {
    await knex.schema.alterTable("capability_scripts", (t) => {
      t.jsonb("requirements_json").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    });
  }
}

export async function down(knex: import("knex").Knex): Promise<void> {
  const hasRequirementsJson = await knex.schema.hasColumn("capability_scripts", "requirements_json");
  if (hasRequirementsJson) {
    await knex.schema.alterTable("capability_scripts", (t) => {
      t.dropColumn("requirements_json");
    });
  }
}
