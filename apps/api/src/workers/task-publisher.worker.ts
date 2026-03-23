import { Worker } from "bullmq";

import { db, withTenantTransaction } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import { taskPublisherQueue, type TaskPublisherJobPayload } from "../infra/queue/queues.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";

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

export function createTaskPublisherWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<TaskPublisherJobPayload>(
    taskPublisherQueue.name,
    async (job) => {
      const { tenantId, taskId } = job.data;
      const row = await db<TaskPublishRow>("async_tasks")
        .where({ task_id: taskId, tenant_id: tenantId })
        .select("task_id", "tenant_id", "customer_id", "conversation_id", "case_id", "title", "task_type", "status", "result_summary")
        .first();

      if (!row || row.status !== "succeeded") {
        return { skipped: true, reason: "task_not_ready" };
      }

      const shouldWriteConversationMessage = row.task_type !== "ai_execution_archive";

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

      await db("async_tasks")
        .where({ task_id: taskId, tenant_id: tenantId })
        .update({
          status: "published",
          published_at: new Date(),
          updated_at: new Date()
        });

      return { taskId, status: "published" };
    },
    {
      connection: workerConnection,
      concurrency: 4
    }
  );
}
