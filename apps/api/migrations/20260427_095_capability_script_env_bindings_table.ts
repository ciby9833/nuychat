import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("capability_script_env_bindings");
  if (exists) return;

  await knex.schema.createTable("capability_script_env_bindings", (t) => {
    t.uuid("binding_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("script_id").notNullable().references("script_id").inTable("capability_scripts").onDelete("CASCADE");
    t.string("env_key", 160).notNullable();
    t.text("env_value").notNullable().defaultTo("");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(["script_id", "env_key"], "capability_script_env_bindings_script_key_uniq");
    t.index(["script_id"], "capability_script_env_bindings_script_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("capability_script_env_bindings");
}
