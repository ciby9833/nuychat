import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("sla_policies");
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn("sla_policies", "unanswered_auto_close_after_sec");
  if (!hasColumn) {
    await knex.schema.alterTable("sla_policies", (table) => {
      table.integer("unanswered_auto_close_after_sec").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("sla_policies");
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn("sla_policies", "unanswered_auto_close_after_sec");
  if (hasColumn) {
    await knex.schema.alterTable("sla_policies", (table) => {
      table.dropColumn("unanswered_auto_close_after_sec");
    });
  }
}
