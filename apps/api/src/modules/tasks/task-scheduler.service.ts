import { db } from "../../infra/db/client.js";
import { taskEngineQueue, type TaskScheduleJobPayload } from "../../infra/queue/queues.js";

export async function scheduleLongTask(input: TaskScheduleJobPayload) {
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

  await taskEngineQueue.add(
    "async-task.execute",
    { tenantId: input.tenantId, taskId },
    {
      jobId: input.schedulerKey ?? undefined,
      removeOnComplete: 200,
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000
      }
    }
  );
}
