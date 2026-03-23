import { Worker } from "bullmq";

import { db } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  taskEngineQueue,
  taskSchedulerQueue,
  type TaskScheduleJobPayload
} from "../infra/queue/queues.js";

export function createTaskSchedulerWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<TaskScheduleJobPayload>(
    taskSchedulerQueue.name,
    async (job) => {
      const payload = job.data;
      const resolvedCaseId =
        payload.caseId !== undefined
          ? payload.caseId
          : payload.conversationId
            ? (
                await db("conversations")
                  .where({ tenant_id: payload.tenantId, conversation_id: payload.conversationId })
                  .select("current_case_id")
                  .first<{ current_case_id: string | null } | undefined>()
              )?.current_case_id ?? null
            : null;

      const [created] = await db("async_tasks")
        .insert({
          tenant_id: payload.tenantId,
          customer_id: payload.customerId ?? null,
          conversation_id: payload.conversationId ?? null,
          case_id: resolvedCaseId,
          task_type: payload.taskType,
          title: payload.title,
          source: payload.source,
          status: "queued",
          priority: payload.priority ?? 100,
          scheduler_key: payload.schedulerKey ?? null,
          payload: JSON.stringify(payload.payload ?? {}),
          created_by_type: payload.source,
          created_by_id: payload.createdById ?? null
        })
        .returning(["task_id"]);

      const taskId = (created as { task_id: string }).task_id;

      await taskEngineQueue.add(
        "async-task.execute",
        { tenantId: payload.tenantId, taskId },
        {
          removeOnComplete: 200,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000
          }
        }
      );

      return { taskId };
    },
    {
      connection: workerConnection,
      concurrency: 5
    }
  );
}
