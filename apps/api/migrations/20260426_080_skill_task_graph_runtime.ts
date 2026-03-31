import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasAsyncTaskId = await knex.schema.hasColumn("skill_tasks", "async_task_id");
  const hasSequenceNo = await knex.schema.hasColumn("skill_tasks", "sequence_no");
  const hasNodeType = await knex.schema.hasColumn("skill_tasks", "node_type");

  await knex.schema.alterTable("skill_tasks", (t) => {
    if (!hasAsyncTaskId) t.uuid("async_task_id").references("task_id").inTable("async_tasks").onDelete("SET NULL");
    if (!hasSequenceNo) t.integer("sequence_no").notNullable().defaultTo(1);
    if (!hasNodeType) t.string("node_type", 40).notNullable().defaultTo("executor");
  });

  await knex.schema.alterTable("skill_tasks", (t) => {
    t.index(["run_id", "sequence_no", "created_at"], "skill_tasks_run_sequence_idx");
    t.index(["async_task_id"], "skill_tasks_async_task_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("skill_tasks", (t) => {
    t.dropIndex(["run_id", "sequence_no", "created_at"], "skill_tasks_run_sequence_idx");
    t.dropIndex(["async_task_id"], "skill_tasks_async_task_idx");
    t.dropColumn("async_task_id");
    t.dropColumn("sequence_no");
    t.dropColumn("node_type");
  });
}
