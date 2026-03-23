import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("auth_sessions", (t) => {
    t.uuid("session_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("identity_id").notNullable().references("identity_id").inTable("identities").onDelete("CASCADE");
    t.uuid("membership_id").notNullable().references("membership_id").inTable("tenant_memberships").onDelete("CASCADE");
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("refresh_jti", 80).notNullable();
    t.string("status", 20).notNullable().defaultTo("active"); // active | revoked | expired
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("revoked_at", { useTz: true });
    t.string("revoke_reason", 120);
    t.string("created_ip", 80);
    t.string("created_user_agent", 300);
    t.timestamps(true, true);

    t.index(["identity_id", "status"], "auth_sessions_identity_status_idx");
    t.index(["membership_id", "status"], "auth_sessions_membership_status_idx");
    t.index(["tenant_id", "status"], "auth_sessions_tenant_status_idx");
    t.unique(["refresh_jti"]);
  });

  await knex.raw(`
    CREATE TRIGGER auth_sessions_set_updated_at
    BEFORE UPDATE ON auth_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS auth_sessions_set_updated_at ON auth_sessions");
  await knex.schema.dropTableIfExists("auth_sessions");
}
