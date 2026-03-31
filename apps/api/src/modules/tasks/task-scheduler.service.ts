import { db } from "../../infra/db/client.js";
import {
  taskBackgroundQueue,
  taskScriptQueue,
  type TaskScheduleJobPayload
} from "../../infra/queue/queues.js";

function resolveTaskQueue(taskType: string) {
  if (taskType === "capability_script_execution") return taskScriptQueue;
  return taskBackgroundQueue;
}

export async function scheduleLongTask(input: TaskScheduleJobPayload) {
  if (input.schedulerKey) {
    const existing = await db("async_tasks")
      .where({
        tenant_id: input.tenantId,
        scheduler_key: input.schedulerKey
      })
      .whereIn("status", ["queued", "running", "published"])
      .orderBy("created_at", "desc")
      .select("task_id")
      .first<{ task_id: string } | undefined>();

    if (existing?.task_id) {
      return { taskId: existing.task_id };
    }
  }

  const resolvedCaseId =
    input.caseId !== undefined
      ? input.caseId
      : input.conversationId
        ? (
            await db("conversations")
              .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
              .select("current_case_id")
              .first<{ current_case_id: string | null } | undefined>()
          )?.current_case_id ?? null
        : null;

  const [created] = await db("async_tasks")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId ?? null,
      conversation_id: input.conversationId ?? null,
      case_id: resolvedCaseId,
      task_type: input.taskType,
      title: input.title,
      source: input.source,
      status: "queued",
      priority: input.priority ?? 100,
      scheduler_key: input.schedulerKey ?? null,
      payload: JSON.stringify(input.payload ?? {}),
      created_by_type: input.source,
      created_by_id: input.createdById ?? null
    })
    .returning(["task_id"]);

  const taskId = (created as { task_id: string }).task_id;
  const queue = resolveTaskQueue(input.taskType);

  try {
    await queue.add(
      "async-task.execute",
      { tenantId: input.tenantId, taskId },
      {
        jobId: taskId,
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000
        }
      }
    );
  } catch (error) {
    await db("async_tasks")
      .where({ task_id: taskId, tenant_id: input.tenantId })
      .delete();
    throw error;
  }

  return { taskId };
}
