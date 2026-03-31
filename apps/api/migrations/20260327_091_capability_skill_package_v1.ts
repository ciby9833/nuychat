export async function up(knex: import("knex").Knex): Promise<void> {
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

  const hasScriptsTable = await knex.schema.hasTable("capability_scripts");
  if (!hasScriptsTable) {
    await knex.schema.createTable("capability_scripts", (t) => {
      t.uuid("script_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("version_id").notNullable().references("version_id").inTable("capability_versions").onDelete("CASCADE");
      t.string("script_key", 120).notNullable();
      t.string("name", 200).notNullable();
      t.string("file_name", 200).notNullable();
      t.string("language", 40).notNullable().defaultTo("python");
      t.text("source_code").notNullable().defaultTo("");
      t.jsonb("env_refs_json").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
      t.boolean("enabled").notNullable().defaultTo(true);
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.unique(["version_id", "script_key"], { indexName: "capability_scripts_version_key_uniq" });
      t.index(["version_id", "created_at"], "capability_scripts_version_created_idx");
    });
  }
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
