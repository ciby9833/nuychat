import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("async_tasks", (t) => {
    t.index(
      ["tenant_id", "scheduler_key", "status", "created_at"],
      "async_tasks_scheduler_key_status_idx"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("async_tasks", (t) => {
    t.dropIndex(["tenant_id", "scheduler_key", "status", "created_at"], "async_tasks_scheduler_key_status_idx");
  });
}
