import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const identity = await knex("identities")
    .where({ email: "admin@demo.com", status: "active" })
    .select("identity_id")
    .first<{ identity_id: string }>();

  if (!identity) return;

  await knex("platform_admins")
    .insert({
      identity_id: identity.identity_id,
      role: "platform_admin",
      is_active: true
    })
    .onConflict(["identity_id"])
    .merge({
      role: "platform_admin",
      is_active: true,
      updated_at: knex.fn.now()
    });
}

export async function down(knex: Knex): Promise<void> {
  const identity = await knex("identities")
    .where({ email: "admin@demo.com" })
    .select("identity_id")
    .first<{ identity_id: string }>();

  if (!identity) return;
  await knex("platform_admins").where({ identity_id: identity.identity_id }).delete();
}
