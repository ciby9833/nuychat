export async function up(knex: import("knex").Knex): Promise<void> {
  const hasVersionsTable = await knex.schema.hasTable("capability_versions");
  if (hasVersionsTable) {
    const hasFormsMd = await knex.schema.hasColumn("capability_versions", "forms_md");
    const hasReferenceMd = await knex.schema.hasColumn("capability_versions", "reference_md");

    if (!hasFormsMd || !hasReferenceMd) {
      await knex.schema.alterTable("capability_versions", (t) => {
        if (!hasFormsMd) {
          t.text("forms_md").notNullable().defaultTo("");
        }
        if (!hasReferenceMd) {
          t.text("reference_md").notNullable().defaultTo("");
        }
      });
    }
  }

  // capability_scripts is created in migration 20260426_085 (after capability_versions)
  // to avoid FK dependency ordering issues on fresh databases.
}

export async function down(knex: import("knex").Knex): Promise<void> {
  await knex.schema.dropTableIfExists("capability_scripts");

  const hasFormsMd = await knex.schema.hasColumn("capability_versions", "forms_md");
  const hasReferenceMd = await knex.schema.hasColumn("capability_versions", "reference_md");
  if (hasFormsMd || hasReferenceMd) {
    await knex.schema.alterTable("capability_versions", (t) => {
      if (hasFormsMd) {
        t.dropColumn("forms_md");
      }
      if (hasReferenceMd) {
        t.dropColumn("reference_md");
      }
    });
  }
}
