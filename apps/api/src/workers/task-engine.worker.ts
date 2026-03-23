import { Worker } from "bullmq";

import { db } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  taskEngineQueue,
  taskPublisherQueue,
  type TaskEngineJobPayload
} from "../infra/queue/queues.js";
import { executeLongTask } from "../modules/tasks/task-engine.service.js";

export function createTaskEngineWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<TaskEngineJobPayload>(
    taskEngineQueue.name,
    async (job) => {
      const { tenantId, taskId } = job.data;
      await db("async_tasks")
        .where({ task_id: taskId, tenant_id: tenantId })
        .update({
          status: "running",
          started_at: new Date(),
          last_error: null,
          updated_at: new Date()
        });

      try {
        const result = await executeLongTask(db, taskId);
        await db("async_tasks")
          .where({ task_id: taskId, tenant_id: tenantId })
          .update({
            status: "succeeded",
            artifact_dir: result.artifactDir,
            result_summary: result.resultSummary,
            result_meta: JSON.stringify(result.resultMeta),
            completed_at: new Date(),
            updated_at: new Date()
          });

        await taskPublisherQueue.add(
          "async-task.publish",
          { tenantId, taskId },
          { removeOnComplete: 200, removeOnFail: 100 }
        );

        return { taskId, status: "succeeded" };
      } catch (error) {
        await db("async_tasks")
          .where({ task_id: taskId, tenant_id: tenantId })
          .update({
            status: "failed",
            last_error: (error as Error).message,
            completed_at: new Date(),
            updated_at: new Date()
          });
        throw error;
      }
    },
    {
      connection: workerConnection,
      concurrency: 2
    }
  );
}
