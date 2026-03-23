import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("identities", (t) => {
    t.uuid("identity_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("email", 200).notNullable().unique();
    t.text("password_hash").notNullable();
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("platform_admins", (t) => {
    t.uuid("platform_admin_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("identity_id").notNullable().references("identity_id").inTable("identities").onDelete("CASCADE");
    t.string("role", 30).notNullable().defaultTo("platform_admin");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["identity_id"]);
  });

  await knex.schema.createTable("tenant_memberships", (t) => {
    t.uuid("membership_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("identity_id").notNullable().references("identity_id").inTable("identities").onDelete("CASCADE");
    t.string("role", 30).notNullable().defaultTo("agent");
    t.string("status", 20).notNullable().defaultTo("active");
    t.boolean("is_default").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.unique(["tenant_id", "identity_id"]);
    t.index(["tenant_id", "role", "status"], "tenant_memberships_lookup_idx");
  });

  await knex.raw(`
    ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_memberships_tenant_isolation ON tenant_memberships
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    CREATE TRIGGER tenant_memberships_set_updated_at
    BEFORE UPDATE ON tenant_memberships
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE TRIGGER identities_set_updated_at
    BEFORE UPDATE ON identities
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    CREATE TRIGGER platform_admins_set_updated_at
    BEFORE UPDATE ON platform_admins
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  // Migrate legacy users into identities + tenant_memberships
  await knex.raw(`
    INSERT INTO identities (email, password_hash, status, created_at, updated_at)
    SELECT u.email, u.password_hash, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END, u.created_at, u.updated_at
    FROM users u
    ON CONFLICT (email) DO NOTHING;
  `);

  await knex.raw(`
    INSERT INTO tenant_memberships (tenant_id, identity_id, role, status, is_default, created_at, updated_at)
    SELECT
      u.tenant_id,
      i.identity_id,
      u.role,
      CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END,
      true,
      u.created_at,
      u.updated_at
    FROM users u
    JOIN identities i ON i.email = u.email
    ON CONFLICT (tenant_id, identity_id) DO NOTHING;
  `);

  await knex.schema.alterTable("agent_profiles", (t) => {
    t.uuid("membership_id").references("membership_id").inTable("tenant_memberships").onDelete("CASCADE");
  });

  await knex.raw(`
    UPDATE agent_profiles ap
    SET membership_id = tm.membership_id
    FROM users u
    JOIN identities i ON i.email = u.email
    JOIN tenant_memberships tm
      ON tm.tenant_id = u.tenant_id
     AND tm.identity_id = i.identity_id
    WHERE ap.user_id = u.user_id
      AND ap.tenant_id = u.tenant_id;
  `);

  await knex.schema.alterTable("agent_profiles", (t) => {
    t.dropForeign(["user_id"]);
    t.dropUnique(["tenant_id", "user_id"]);
    t.dropColumn("user_id");
    t.uuid("membership_id").notNullable().alter();
    t.unique(["tenant_id", "membership_id"]);
  });

  await knex.schema.dropTableIfExists("users");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (t) => {
    t.uuid("user_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("email", 200).notNullable();
    t.text("password_hash").notNullable();
    t.string("role", 30).notNullable().defaultTo("agent");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "email"]);
  });

  await knex.schema.alterTable("agent_profiles", (t) => {
    t.uuid("user_id");
  });

  await knex.raw(`
    UPDATE agent_profiles ap
    SET user_id = u.user_id
    FROM users u
    JOIN identities i ON i.email = u.email
    JOIN tenant_memberships tm ON tm.tenant_id = u.tenant_id AND tm.identity_id = i.identity_id
    WHERE ap.membership_id = tm.membership_id;
  `);

  await knex.schema.alterTable("agent_profiles", (t) => {
    t.dropForeign(["membership_id"]);
    t.dropUnique(["tenant_id", "membership_id"]);
    t.dropColumn("membership_id");
    t.uuid("user_id").notNullable().references("user_id").inTable("users").onDelete("CASCADE").alter();
    t.unique(["tenant_id", "user_id"]);
  });

  await knex.raw("DROP TRIGGER IF EXISTS tenant_memberships_set_updated_at ON tenant_memberships");
  await knex.raw("DROP TRIGGER IF EXISTS identities_set_updated_at ON identities");
  await knex.raw("DROP TRIGGER IF EXISTS platform_admins_set_updated_at ON platform_admins");
  await knex.raw("DROP POLICY IF EXISTS tenant_memberships_tenant_isolation ON tenant_memberships");

  await knex.schema.dropTableIfExists("tenant_memberships");
  await knex.schema.dropTableIfExists("platform_admins");
  await knex.schema.dropTableIfExists("identities");
}
