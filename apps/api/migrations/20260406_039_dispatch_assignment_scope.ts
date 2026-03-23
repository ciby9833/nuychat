import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("queue_assignments", (t) => {
    t.uuid("department_id").references("department_id").inTable("departments").onDelete("SET NULL");
    t.uuid("team_id").references("team_id").inTable("teams").onDelete("SET NULL");
    t.text("assignment_reason");
  });

  await knex.schema.alterTable("queue_assignments", (t) => {
    t.index(["tenant_id", "department_id", "status"], "queue_assignments_tenant_department_status_idx");
    t.index(["tenant_id", "team_id", "status"], "queue_assignments_tenant_team_status_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("queue_assignments", (t) => {
    t.dropIndex(["tenant_id", "team_id", "status"], "queue_assignments_tenant_team_status_idx");
    t.dropIndex(["tenant_id", "department_id", "status"], "queue_assignments_tenant_department_status_idx");
    t.dropColumn("assignment_reason");
    t.dropColumn("team_id");
    t.dropColumn("department_id");
  });
}
