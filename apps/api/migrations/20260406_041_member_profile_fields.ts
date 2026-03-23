import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenant_memberships", (t) => {
    t.string("display_name", 120);
    t.string("employee_no", 60);
    t.unique(["tenant_id", "employee_no"], { indexName: "tenant_memberships_tenant_employee_no_uniq" });
  });

  await knex.raw(`
    UPDATE tenant_memberships tm
    SET display_name = ap.display_name
    FROM agent_profiles ap
    WHERE ap.membership_id = tm.membership_id
      AND tm.display_name IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tenant_memberships", (t) => {
    t.dropUnique(["tenant_id", "employee_no"], "tenant_memberships_tenant_employee_no_uniq");
    t.dropColumn("employee_no");
    t.dropColumn("display_name");
  });
}
