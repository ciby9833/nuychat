import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const installTableExists = await knex.schema.hasTable("marketplace_skill_installs");
  if (installTableExists) {
    await knex.schema.alterTable("marketplace_skill_installs", (t) => {
      t.boolean("ai_whitelisted").notNullable().defaultTo(true);
    });
  }

  await knex.schema.createTable("conversation_skill_preferences", (t) => {
    t.uuid("preference_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").notNullable().references("conversation_id").inTable("conversations").onDelete("CASCADE");
    t.jsonb("preferred_skills").notNullable().defaultTo("[]");
    t.string("updated_by_type", 20).notNullable().defaultTo("agent"); // agent | ai | workflow
    t.uuid("updated_by_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.timestamps(true, true);

    t.unique(["tenant_id", "conversation_id"], "conversation_skill_preferences_tenant_conversation_uniq");
    t.index(["tenant_id", "conversation_id"], "conversation_skill_preferences_lookup_idx");
  });

  await knex.raw(`
    ALTER TABLE conversation_skill_preferences ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversation_skill_preferences FORCE ROW LEVEL SECURITY;
    CREATE POLICY conversation_skill_preferences_tenant_isolation ON conversation_skill_preferences
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER conversation_skill_preferences_set_updated_at
    BEFORE UPDATE ON conversation_skill_preferences
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS conversation_skill_preferences_set_updated_at ON conversation_skill_preferences");
  await knex.raw("DROP POLICY IF EXISTS conversation_skill_preferences_tenant_isolation ON conversation_skill_preferences");
  await knex.schema.dropTableIfExists("conversation_skill_preferences");

  const installTableExists = await knex.schema.hasTable("marketplace_skill_installs");
  if (installTableExists) {
    await knex.schema.alterTable("marketplace_skill_installs", (t) => {
      t.dropColumn("ai_whitelisted");
    });
  }
}
