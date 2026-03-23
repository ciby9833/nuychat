import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_auth_sessions", (t) => {
    t.uuid("session_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("identity_id").notNullable().references("identity_id").inTable("identities").onDelete("CASCADE");
    t.string("refresh_jti", 80).notNullable().unique();
    t.string("status", 20).notNullable().defaultTo("active"); // active | revoked | expired
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("revoked_at", { useTz: true });
    t.string("revoke_reason", 120);
    t.string("created_ip", 80);
    t.string("created_user_agent", 300);
    t.timestamps(true, true);

    t.index(["identity_id", "status"], "platform_auth_sessions_identity_status_idx");
    t.index(["status", "expires_at"], "platform_auth_sessions_status_expires_idx");
  });

  await knex.raw(`
    CREATE TRIGGER platform_auth_sessions_set_updated_at
    BEFORE UPDATE ON platform_auth_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS platform_auth_sessions_set_updated_at ON platform_auth_sessions");
  await knex.schema.dropTableIfExists("platform_auth_sessions");
}
