import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wa_conversations", (t) => {
    t.timestamp("archived_at", { useTz: true });
    t.uuid("archived_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
  });

  await knex.schema.alterTable("wa_messages", (t) => {
    t.timestamp("edited_at", { useTz: true });
    t.uuid("edited_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamp("deleted_for_me_at", { useTz: true });
    t.uuid("deleted_for_me_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
    t.timestamp("revoked_at", { useTz: true });
    t.uuid("revoked_by_membership_id").references("membership_id").inTable("tenant_memberships").onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wa_messages", (t) => {
    t.dropColumn("revoked_by_membership_id");
    t.dropColumn("revoked_at");
    t.dropColumn("deleted_for_me_by_membership_id");
    t.dropColumn("deleted_for_me_at");
    t.dropColumn("edited_by_membership_id");
    t.dropColumn("edited_at");
  });

  await knex.schema.alterTable("wa_conversations", (t) => {
    t.dropColumn("archived_by_membership_id");
    t.dropColumn("archived_at");
  });
}
