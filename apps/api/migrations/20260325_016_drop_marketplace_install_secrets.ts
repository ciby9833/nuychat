import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_install_secrets_set_updated_at ON marketplace_install_secrets");
  await knex.schema.dropTableIfExists("marketplace_install_secrets");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("marketplace_install_secrets", (t) => {
    t.uuid("secret_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("install_id").notNullable().references("install_id").inTable("marketplace_skill_installs").onDelete("CASCADE").unique();
    t.text("ciphertext").notNullable();
    t.string("iv", 64).notNullable();
    t.string("auth_tag", 64).notNullable();
    t.string("key_version", 40).notNullable().defaultTo("v1");
    t.uuid("updated_by_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.timestamps(true, true);

    t.index(["updated_by_identity_id", "updated_at"], "marketplace_install_secrets_updated_by_idx");
  });

  await knex.raw(`
    CREATE TRIGGER marketplace_install_secrets_set_updated_at
    BEFORE UPDATE ON marketplace_install_secrets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}
