import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasWaitingCustomerClose = await knex.schema.hasColumn("sla_policies", "waiting_customer_close_after_sec");
  if (!hasWaitingCustomerClose) {
    await knex.schema.alterTable("sla_policies", (t) => {
      t.integer("waiting_customer_close_after_sec").nullable();
    });
  }

  const hasSemanticCloseGrace = await knex.schema.hasColumn("sla_policies", "semantic_close_grace_sec");
  if (!hasSemanticCloseGrace) {
    await knex.schema.alterTable("sla_policies", (t) => {
      t.integer("semantic_close_grace_sec").nullable();
    });
  }

  await knex("sla_policies")
    .whereNull("waiting_customer_close_after_sec")
    .update({
      waiting_customer_close_after_sec: knex.ref("idle_close_after_sec")
    });
}

export async function down(knex: Knex): Promise<void> {
  const hasSemanticCloseGrace = await knex.schema.hasColumn("sla_policies", "semantic_close_grace_sec");
  if (hasSemanticCloseGrace) {
    await knex.schema.alterTable("sla_policies", (t) => {
      t.dropColumn("semantic_close_grace_sec");
    });
  }

  const hasWaitingCustomerClose = await knex.schema.hasColumn("sla_policies", "waiting_customer_close_after_sec");
  if (hasWaitingCustomerClose) {
    await knex.schema.alterTable("sla_policies", (t) => {
      t.dropColumn("waiting_customer_close_after_sec");
    });
  }
}
