import { Worker } from "bullmq";

import { db, withTenantTransaction } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  taskEngineQueue,
  type TaskEngineJobPayload
} from "../infra/queue/queues.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";
import { executeLongTask } from "../modules/tasks/task-engine.service.js";

type TaskPublishRow = {
  task_id: string;
  tenant_id: string;
  customer_id: string | null;
  conversation_id: string | null;
  case_id: string | null;
  title: string;
  task_type: string;
  status: string;
  result_summary: string | null;
};

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
            status: "published",
            artifact_dir: result.artifactDir,
            result_summary: result.resultSummary,
            result_meta: JSON.stringify(result.resultMeta),
            completed_at: new Date(),
            published_at: new Date(),
            updated_at: new Date()
          });
        await publishTaskResult(tenantId, taskId);

        return { taskId, status: "published" };
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

async function publishTaskResult(tenantId: string, taskId: string) {
  const row = await db<TaskPublishRow>("async_tasks")
    .where({ task_id: taskId, tenant_id: tenantId })
    .select("task_id", "tenant_id", "customer_id", "conversation_id", "case_id", "title", "task_type", "status", "result_summary")
    .first();

  if (!row) return;

  const shouldWriteConversationMessage = ![
    "ai_execution_archive",
    "vector_customer_profile_reindex",
    "vector_batch_reindex",
    "vector_memory_unit_reindex",
    "memory_encode_conversation_event",
    "memory_encode_task_event"
  ].includes(row.task_type);

  if (row.conversation_id && shouldWriteConversationMessage) {
    await withTenantTransaction(tenantId, async (trx) => {
      await trx("messages").insert({
        tenant_id: tenantId,
        conversation_id: row.conversation_id,
        case_id: row.case_id,
        direction: "system",
        message_type: "task_update",
        sender_type: "workflow",
        sender_id: null,
        content: JSON.stringify({
          taskId: row.task_id,
          taskType: row.task_type,
          title: row.title,
          summary: row.result_summary
        })
      });
    });

    realtimeEventBus.emitEvent("message.sent", {
      tenantId,
      conversationId: row.conversation_id,
      messageId: null,
      text: row.result_summary ?? undefined,
      occurredAt: new Date().toISOString()
    });
  }

  if (row.conversation_id) {
    realtimeEventBus.emitEvent("task.updated", {
      tenantId,
      taskId: row.task_id,
      conversationId: row.conversation_id,
      status: "published",
      title: row.title,
      summary: row.result_summary,
      occurredAt: new Date().toISOString()
    });
  }
}
