// This file creates isolated async task workers for API startup.
// It serves the backend runtime and keeps slow external/model tools from blocking background task execution.
import { Worker, type Queue } from "bullmq";

import { db, withTenantTransaction } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  taskBackgroundQueue,
  outboundQueue,
  taskScriptQueue,
  type TaskEngineJobPayload
} from "../infra/queue/queues.js";
import { realtimeEventBus } from "../modules/realtime/realtime.events.js";
import { executeLongTask } from "../modules/tasks/task-engine.service.js";
import {
  inferStructuredMessageFromExecutionPayload,
  isInternalControlPayload,
  normalizeStructuredActions,
  structuredToPlainText
} from "../shared/messaging/structured-message.js";
import {
  completeSystemSkillNode,
  markSkillNodeFailedByAsyncTask,
  markSkillNodeRunningByAsyncTask,
  markSkillNodeSucceededByAsyncTask
} from "../modules/agent-skills/skill-task-runtime.service.js";

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
  last_error: string | null;
};

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function createAsyncTaskWorker(queue: Queue, concurrency: number) {
  const workerConnection = duplicateRedisConnection();

  return new Worker<TaskEngineJobPayload>(
    queue.name,
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
      await markSkillNodeRunningByAsyncTask(db, taskId);

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
        await markSkillNodeSucceededByAsyncTask(db, {
          asyncTaskId: taskId,
          outputPayload: result.payload
        });
        await publishTaskResult(tenantId, taskId);

        return { taskId, status: "published" };
      } catch (error) {
        const attempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
        const isFinalFailure = job.attemptsMade + 1 >= attempts;
        await db("async_tasks")
          .where({ task_id: taskId, tenant_id: tenantId })
          .update({
            status: isFinalFailure ? "failed" : "queued",
            last_error: (error as Error).message,
            completed_at: isFinalFailure ? new Date() : null,
            updated_at: new Date()
          });
        if (isFinalFailure) {
          await markSkillNodeFailedByAsyncTask(db, {
            asyncTaskId: taskId,
            errorPayload: {
              message: (error as Error).message
            }
          });
          await publishTaskFailure(tenantId, taskId, (error as Error).message);
        }
        throw error;
      }
    },
    {
      connection: workerConnection as any,
      concurrency
    }
  );
}

export function createTaskBackgroundWorker() {
  return createAsyncTaskWorker(
    taskBackgroundQueue,
    toPositiveInt(process.env.TASK_BACKGROUND_CONCURRENCY, 4)
  );
}

export function createTaskScriptWorker() {
  return createAsyncTaskWorker(
    taskScriptQueue,
    toPositiveInt(process.env.TASK_SCRIPT_CONCURRENCY, 6)
  );
}

async function publishTaskResult(tenantId: string, taskId: string) {
  const row = await db<TaskPublishRow>("async_tasks")
    .where({ task_id: taskId, tenant_id: tenantId })
    .select("task_id", "tenant_id", "customer_id", "conversation_id", "case_id", "title", "task_type", "status", "result_summary", "last_error")
    .first();

  if (!row) return;
  if (row.task_type === "task_result_postprocess") return;

  const executionPayload = await db("skill_tasks")
    .where({ async_task_id: taskId })
    .select("output_payload")
    .orderBy("created_at", "desc")
    .first<{ output_payload: unknown } | undefined>()
    .then((current) => {
      if (!current?.output_payload) return {};
      if (typeof current.output_payload === "string") {
        try {
          return JSON.parse(current.output_payload) as Record<string, unknown>;
        } catch {
          return {};
        }
      }
      return current.output_payload && typeof current.output_payload === "object" && !Array.isArray(current.output_payload)
        ? current.output_payload as Record<string, unknown>
        : {};
    });

  const customerReply = typeof executionPayload.customerReply === "string"
    ? executionPayload.customerReply.trim()
    : "";
  const structured = inferStructuredMessageFromExecutionPayload(executionPayload, customerReply);
  const actions = normalizeStructuredActions(
    executionPayload && typeof executionPayload === "object" && !Array.isArray(executionPayload)
      ? (executionPayload as Record<string, unknown>).actions
      : null
  );
  const outboundText = isInternalControlPayload(customerReply)
    ? ""
    : structuredToPlainText(structured, customerReply);

  if (row.task_type === "capability_script_execution" && row.conversation_id && outboundText) {
    const conversation = await db("conversations")
      .where({ tenant_id: tenantId, conversation_id: row.conversation_id })
      .select("channel_id", "channel_type")
      .first<{ channel_id: string; channel_type: string } | undefined>();

    if (conversation?.channel_id && conversation?.channel_type) {
      await outboundQueue.add(
        "outbound.ai_reply",
        {
          tenantId,
          conversationId: row.conversation_id,
          channelId: conversation.channel_id,
          channelType: conversation.channel_type,
          message: {
            text: outboundText,
            structured,
            actions,
            aiAgentName: "AI"
          }
        },
        { removeOnComplete: 100, removeOnFail: 50 }
      );
    }
  }

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

  const skillNode = await db("skill_tasks")
    .where({ async_task_id: taskId })
    .select("run_id", "step_key")
    .first<{ run_id: string; step_key: string } | undefined>();

  if (skillNode) {
    await completeSystemSkillNode(db, {
      runId: skillNode.run_id,
      stepKey: `${skillNode.step_key}.publish`,
      outputPayload: {
        asyncTaskId: taskId,
        resultSummary: row.result_summary,
        published: true
      }
    });
  }
}

async function publishTaskFailure(tenantId: string, taskId: string, errorMessage: string) {
  const row = await db<TaskPublishRow>("async_tasks")
    .where({ task_id: taskId, tenant_id: tenantId })
    .select("task_id", "tenant_id", "customer_id", "conversation_id", "case_id", "title", "task_type", "status", "result_summary", "last_error")
    .first();

  if (!row) return;

  const summary = formatTaskFailureSummary(row.task_type, errorMessage);

  if (row.conversation_id) {
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
          status: "failed",
          summary,
          error: errorMessage.slice(0, 1000)
        })
      });
    });

    realtimeEventBus.emitEvent("message.sent", {
      tenantId,
      conversationId: row.conversation_id,
      messageId: null,
      text: summary,
      occurredAt: new Date().toISOString()
    });
  }

  realtimeEventBus.emitEvent("task.updated", {
    tenantId,
    taskId: row.task_id,
    conversationId: row.conversation_id,
    status: "failed",
    title: row.title,
    summary,
    error: errorMessage.slice(0, 1000),
    occurredAt: new Date().toISOString()
  });
}

function formatTaskFailureSummary(taskType: string, errorMessage: string) {
  if (errorMessage.startsWith("upstream_timeout:")) {
    return `工具执行失败：外部接口超时（${taskType}）`;
  }
  if (errorMessage.startsWith("connector_unavailable:") || errorMessage.startsWith("upstream_circuit_open:")) {
    return `工具执行失败：外部接口短时熔断中，请稍后重试（${taskType}）`;
  }
  if (errorMessage.startsWith("upstream_")) {
    return `工具执行失败：外部接口返回异常（${taskType}）`;
  }
  if (errorMessage.startsWith("upstream_network_error:")) {
    return `工具执行失败：外部接口网络异常（${taskType}）`;
  }
  return `工具执行失败：${errorMessage.slice(0, 160)}`;
}
