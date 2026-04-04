import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("case_tasks", (t) => {
    t.boolean("requires_customer_reply").notNullable().defaultTo(false);
    t.string("customer_reply_status", 20);
    t.uuid("customer_reply_message_id").references("message_id").inTable("messages").onDelete("SET NULL");
    t.timestamp("customer_reply_sent_at", { useTz: true });

    t.index(
      ["tenant_id", "requires_customer_reply", "customer_reply_status", "status"],
      "case_tasks_customer_reply_idx"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("case_tasks", (t) => {
    t.dropIndex(
      ["tenant_id", "requires_customer_reply", "customer_reply_status", "status"],
      "case_tasks_customer_reply_idx"
    );
    t.dropColumn("customer_reply_sent_at");
    t.dropColumn("customer_reply_message_id");
    t.dropColumn("customer_reply_status");
    t.dropColumn("requires_customer_reply");
  });
}
