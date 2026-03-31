import type { Knex } from "knex";

import { scheduleLongTask } from "../tasks/task-scheduler.service.js";

type SkillTaskNodeInput = {
  stepKey: string;
  taskType: string;
  nodeType: "executor" | "system";
  sequenceNo: number;
  dependsOn?: string[];
  inputPayload?: Record<string, unknown>;
};

type SkillTaskRow = {
  task_id: string;
  run_id: string;
  step_key: string;
  task_type: string;
  status: string;
  depends_on: unknown;
  input_payload: unknown;
  output_payload: unknown;
  error_payload: unknown;
  async_task_id: string | null;
  node_type: string;
  sequence_no: number;
};

function sanitizeJsonValue<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, current) => {
      if (typeof current === "bigint") return current.toString();
      if (current === undefined) return null;
      return current;
    })
  ) as T;
}

function toJsonb(value: unknown) {
  return JSON.stringify(sanitizeJsonValue(value));
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export async function createSkillTaskGraph(
  db: Knex | Knex.Transaction,
  input: {
    runId: string;
    nodes: SkillTaskNodeInput[];
  }
) {
  await db("skill_tasks").where({ run_id: input.runId }).del();
  for (const node of input.nodes) {
    await db("skill_tasks").insert({
      run_id: input.runId,
      step_key: node.stepKey,
      task_type: node.taskType,
      node_type: node.nodeType,
      sequence_no: node.sequenceNo,
      status: (node.dependsOn?.length ?? 0) > 0 ? "waiting_dependency" : "planned",
      depends_on: toJsonb(node.dependsOn ?? []),
      input_payload: toJsonb(node.inputPayload ?? {}),
      output_payload: toJsonb({}),
      error_payload: toJsonb({})
    });
  }
}

export async function dispatchReadySkillNodes(
  db: Knex | Knex.Transaction,
  runId: string
) {
  const run = await db("skill_runs")
    .where({ run_id: runId })
    .select("tenant_id", "customer_id", "conversation_id", "case_id")
    .first<{ tenant_id: string; customer_id: string | null; conversation_id: string | null; case_id: string | null } | undefined>();
  if (!run) return;

  const rows = await db<SkillTaskRow>("skill_tasks")
    .where({ run_id: runId, status: "planned", node_type: "executor" })
    .whereNull("async_task_id")
    .orderBy([{ column: "sequence_no", order: "asc" }, { column: "created_at", order: "asc" }]);

  for (const row of rows) {
    const inputPayload = row.input_payload && typeof row.input_payload === "object" && !Array.isArray(row.input_payload)
      ? row.input_payload as Record<string, unknown>
      : {};
    const title = typeof inputPayload.title === "string" && inputPayload.title.trim() ? inputPayload.title.trim() : row.task_type;
    const payload = inputPayload.payload && typeof inputPayload.payload === "object" && !Array.isArray(inputPayload.payload)
      ? inputPayload.payload as Record<string, unknown>
      : inputPayload;

    const scheduled = await scheduleLongTask({
      tenantId: run.tenant_id,
      customerId: run.customer_id,
      conversationId: run.conversation_id,
      caseId: run.case_id,
      taskType: row.task_type,
      title,
      source: "ai",
      priority: 80,
      schedulerKey: `skill-run:${runId}:${row.step_key}`,
      payload
    });

    await linkAsyncTaskToSkillNode(db, {
      runId,
      stepKey: row.step_key,
      asyncTaskId: scheduled.taskId
    });
  }
}

export async function linkAsyncTaskToSkillNode(
  db: Knex | Knex.Transaction,
  input: {
    runId: string;
    stepKey: string;
    asyncTaskId: string;
  }
) {
  await db("skill_tasks")
    .where({ run_id: input.runId, step_key: input.stepKey })
    .update({
      async_task_id: input.asyncTaskId,
      status: "queued",
      updated_at: db.fn.now()
    });
}

export async function markSkillNodeRunningByAsyncTask(
  db: Knex | Knex.Transaction,
  asyncTaskId: string
) {
  await db("skill_tasks")
    .where({ async_task_id: asyncTaskId })
    .update({
      status: "running",
      started_at: new Date(),
      updated_at: db.fn.now()
    });
}

export async function markSkillNodeSucceededByAsyncTask(
  db: Knex | Knex.Transaction,
  input: {
    asyncTaskId: string;
    outputPayload: Record<string, unknown>;
  }
) {
  const row = await db<SkillTaskRow>("skill_tasks")
    .where({ async_task_id: input.asyncTaskId })
    .first();
  if (!row) return;

  await db("skill_tasks")
    .where({ task_id: row.task_id })
    .update({
      status: "succeeded",
      output_payload: toJsonb(input.outputPayload),
      completed_at: new Date(),
      updated_at: db.fn.now()
    });

  await unlockDependentSkillNodes(db, row.run_id);
  await dispatchReadySkillNodes(db, row.run_id);
}

export async function markSkillNodeFailedByAsyncTask(
  db: Knex | Knex.Transaction,
  input: {
    asyncTaskId: string;
    errorPayload: Record<string, unknown>;
  }
) {
  const row = await db<SkillTaskRow>("skill_tasks")
    .where({ async_task_id: input.asyncTaskId })
    .first();
  if (!row) return;

  await db("skill_tasks")
    .where({ task_id: row.task_id })
    .update({
      status: "failed",
      error_payload: toJsonb(input.errorPayload),
      completed_at: new Date(),
      updated_at: db.fn.now()
    });

  const dependents = await db<SkillTaskRow>("skill_tasks")
    .where({ run_id: row.run_id })
    .whereRaw("depends_on @> ?::jsonb", [JSON.stringify([row.step_key])]);

  for (const dependent of dependents) {
    if (dependent.status !== "waiting_dependency" && dependent.status !== "planned") continue;
    await db("skill_tasks")
      .where({ task_id: dependent.task_id })
      .update({
        status: "blocked",
        error_payload: toJsonb({
          reason: "dependency_failed",
          failedStep: row.step_key
        }),
        updated_at: db.fn.now()
      });
  }
}

export async function completeSystemSkillNode(
  db: Knex | Knex.Transaction,
  input: {
    runId: string;
    stepKey: string;
    outputPayload: Record<string, unknown>;
  }
) {
  await db("skill_tasks")
    .where({ run_id: input.runId, step_key: input.stepKey })
    .update({
      status: "succeeded",
      started_at: new Date(),
      completed_at: new Date(),
      output_payload: toJsonb(input.outputPayload),
      updated_at: db.fn.now()
    });
}

async function unlockDependentSkillNodes(
  db: Knex | Knex.Transaction,
  runId: string
) {
  const rows = await db<SkillTaskRow>("skill_tasks")
    .where({ run_id: runId })
    .orderBy([{ column: "sequence_no", order: "asc" }, { column: "created_at", order: "asc" }]);

  const byStep = new Map(rows.map((row) => [row.step_key, row]));
  for (const row of rows) {
    if (row.status !== "waiting_dependency") continue;
    const deps = parseStringArray(row.depends_on);
    if (deps.length === 0) {
      await db("skill_tasks").where({ task_id: row.task_id }).update({ status: "planned", updated_at: db.fn.now() });
      continue;
    }
    const allSucceeded = deps.every((dep) => byStep.get(dep)?.status === "succeeded");
    if (!allSucceeded) continue;
    await db("skill_tasks").where({ task_id: row.task_id }).update({ status: "planned", updated_at: db.fn.now() });
  }
}
