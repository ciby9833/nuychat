import type { Knex } from "knex";

import { writeTaskArtifacts, type TaskArtifactInput } from "./task-storage.service.js";
import { runCapabilityScriptExecution } from "./task-script-execution.service.js";
import {
  runVectorBatchReindex,
  runVectorCustomerProfileReindex,
  runVectorMemoryUnitReindex
} from "./task-vector-memory.service.js";
import { scheduleLongTask } from "./task-scheduler.service.js";
import { recordCustomerMemoryItem, upsertCustomerStateSnapshot } from "../memory/customer-intelligence.service.js";
import {
  encodeConversationMemories,
  encodeTaskOutcomeMemories
} from "../memory/memory-encoder.service.js";
import { runQaAiReviewTask } from "../quality-admin/qa-v2.service.js";

type AsyncTaskRow = {
  task_id: string;
  tenant_id: string;
  customer_id: string | null;
  conversation_id: string | null;
  case_id: string | null;
  task_type: string;
  title: string;
  source: string;
  payload: unknown;
};

type TaskResultPostprocessPayload = {
  taskId: string;
  taskType: string;
  title: string;
  source: string;
  customerId: string | null;
  conversationId: string | null;
  caseId: string | null;
  executionPayload: Record<string, unknown>;
  resultSummary: string;
};

function parsePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function summarizeTask(row: AsyncTaskRow, payload: Record<string, unknown>) {
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  if (summary) return summary.slice(0, 1000);

  if (row.task_type === "ai_execution_archive") {
    const intent = typeof payload.intent === "string" ? payload.intent : "unknown";
    const response = typeof payload.response === "string" ? payload.response.slice(0, 220) : "";
    const skills = Array.isArray(payload.skillsInvoked) ? payload.skillsInvoked.map(String).filter(Boolean) : [];
    return [
      `AI execution archived`,
      `intent=${intent}`,
      skills.length > 0 ? `skills=${skills.join(",")}` : null,
      response ? `response=${response}` : null
    ].filter(Boolean).join(" | ");
  }

  if (row.task_type === "capability_script_execution") {
    return [
      `Capability script completed`,
      typeof payload.scriptKey === "string" ? `script=${payload.scriptKey}` : null,
      typeof payload.status === "string" ? `status=${payload.status}` : null
    ].filter(Boolean).join(" | ");
  }

  if (row.task_type === "vector_customer_profile_reindex") {
    return [
      `Vector profile reindex completed`,
      typeof payload.customerId === "string" ? `customer=${payload.customerId}` : null,
      typeof payload.indexed === "boolean" ? `indexed=${payload.indexed}` : null,
      typeof payload.conversationCount === "number" ? `conversations=${payload.conversationCount}` : null
    ].filter(Boolean).join(" | ");
  }

  if (row.task_type === "vector_batch_reindex") {
    return [
      `Vector batch reindex queued`,
      typeof payload.queuedCount === "number" ? `queued=${payload.queuedCount}` : null
    ].filter(Boolean).join(" | ");
  }

  if (row.task_type === "vector_memory_unit_reindex") {
    return [
      `Vector memory reindex completed`,
      typeof payload.memoryUnitId === "string" ? `memory=${payload.memoryUnitId}` : null,
      typeof payload.indexed === "boolean" ? `indexed=${payload.indexed}` : null
    ].filter(Boolean).join(" | ");
  }

  if (row.task_type === "memory_encode_conversation_event" || row.task_type === "memory_encode_task_event") {
    return [
      `Memory encoding completed`,
      typeof payload.encoded === "number" ? `encoded=${payload.encoded}` : null,
      typeof payload.skipped === "boolean" ? `skipped=${payload.skipped}` : null,
      typeof payload.reason === "string" ? `reason=${payload.reason}` : null
    ].filter(Boolean).join(" | ");
  }

  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  return note ? note.slice(0, 1000) : `${row.title} completed`;
}

function buildArtifacts(row: AsyncTaskRow, payload: Record<string, unknown>): TaskArtifactInput[] {
  const artifacts: TaskArtifactInput[] = [];

  artifacts.push({
    kind: "payload",
    fileName: "payload.json",
    content: toPrettyJson(payload),
    mimeType: "application/json"
  });

  if (row.task_type === "ai_execution_archive") {
    const response = typeof payload.response === "string" ? payload.response : "";
    const context = typeof payload.context === "string" ? payload.context : "";
    const steps = payload.executionSteps ?? {};

    if (response) {
      artifacts.push({
        kind: "response",
        fileName: "response.md",
        content: response,
        mimeType: "text/markdown"
      });
    }
    if (context) {
      artifacts.push({
        kind: "context",
        fileName: "context.md",
        content: context,
        mimeType: "text/markdown"
      });
    }
    artifacts.push({
      kind: "execution",
      fileName: "execution.json",
      content: toPrettyJson(steps),
      mimeType: "application/json"
    });
  }

  if (row.task_type === "capability_script_execution") {
    artifacts.push({
      kind: "result",
      fileName: "result.json",
      content: toPrettyJson(payload),
      mimeType: "application/json"
    });
  }

  if (
    row.task_type === "vector_customer_profile_reindex" ||
    row.task_type === "vector_batch_reindex" ||
    row.task_type === "vector_memory_unit_reindex" ||
    row.task_type === "memory_encode_conversation_event" ||
    row.task_type === "memory_encode_task_event"
  ) {
    artifacts.push({
      kind: "vector-result",
      fileName: "vector-result.json",
      content: toPrettyJson(payload),
      mimeType: "application/json"
    });
  }

  const docs = Array.isArray(payload.documents) ? payload.documents : [];
  for (const [index, rawDoc] of docs.entries()) {
    if (!rawDoc || typeof rawDoc !== "object" || Array.isArray(rawDoc)) continue;
    const doc = rawDoc as Record<string, unknown>;
    const content = typeof doc.content === "string" ? doc.content : "";
    if (!content.trim()) continue;
    const fileName = typeof doc.fileName === "string" && doc.fileName.trim()
      ? doc.fileName.trim()
      : `document-${index + 1}.md`;
    artifacts.push({
      kind: typeof doc.kind === "string" ? doc.kind : "document",
      fileName,
      content,
      mimeType: typeof doc.mimeType === "string" ? doc.mimeType : "text/markdown",
      metadata: doc.metadata && typeof doc.metadata === "object" && !Array.isArray(doc.metadata)
        ? doc.metadata as Record<string, unknown>
        : {}
    });
  }

  return artifacts;
}

export async function executeLongTask(db: Knex, taskId: string) {
  const row = await db<AsyncTaskRow>("async_tasks")
    .where({ task_id: taskId })
    .select("task_id", "tenant_id", "customer_id", "conversation_id", "case_id", "task_type", "title", "source", "payload")
    .first();

  if (!row) {
    throw new Error(`Async task not found: ${taskId}`);
  }

  const payload = parsePayload(row.payload);
  if (row.task_type === "task_result_postprocess") {
    await runTaskResultPostprocess(db, row, payload);
    return {
      row,
      payload,
      artifactDir: null,
      resultSummary: typeof payload.resultSummary === "string" && payload.resultSummary.trim()
        ? payload.resultSummary.trim()
        : `${row.title} postprocess completed`,
      resultMeta: {
        artifactCount: 0,
        source: row.source,
        postprocess: true
      }
    };
  }

  if (row.task_type === "qa_ai_review_generate") {
    const qaTaskId = typeof payload.qaTaskId === "string" ? payload.qaTaskId.trim() : "";
    if (!qaTaskId) {
      throw new Error(`Missing qaTaskId for async task: ${taskId}`);
    }

    const result = await runQaAiReviewTask(db, {
      tenantId: row.tenant_id,
      qaTaskId,
      asyncTaskId: taskId,
      payload
    });

    return {
      row,
      payload,
      artifactDir: null,
      resultSummary: result.skipped
        ? `QA AI review skipped: ${String(result.reason ?? "unknown")}`
        : `QA AI review completed (${String(result.queueType ?? "unknown")})`,
      resultMeta: {
        artifactCount: 0,
        source: row.source,
        qaTaskId,
        qa: true
      }
    };
  }

  const executionPayload = await enrichExecutionPayload(db, row, payload);
  const resultSummary = summarizeTask(row, executionPayload);
  await scheduleTaskResultPostprocess(row, executionPayload, resultSummary);

  return {
    row,
    payload: executionPayload,
    artifactDir: null,
    resultSummary,
    resultMeta: {
      artifactCount: 0,
      source: row.source,
      postprocessScheduled: true
    }
  };
}

async function scheduleTaskResultPostprocess(
  row: AsyncTaskRow,
  executionPayload: Record<string, unknown>,
  resultSummary: string
) {
  await scheduleLongTask({
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    conversationId: row.conversation_id,
    caseId: row.case_id,
    taskType: "task_result_postprocess",
    title: `Postprocess ${row.title}`,
    source: "workflow",
    priority: 90,
    schedulerKey: `task-postprocess:${row.task_id}`,
    payload: {
      taskId: row.task_id,
      taskType: row.task_type,
      title: row.title,
      source: row.source,
      customerId: row.customer_id,
      conversationId: row.conversation_id,
      caseId: row.case_id,
      executionPayload,
      resultSummary
    } satisfies TaskResultPostprocessPayload
  });
}

async function runTaskResultPostprocess(
  db: Knex,
  row: AsyncTaskRow,
  payload: Record<string, unknown>
) {
  const sourceTaskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  const sourceTaskType = typeof payload.taskType === "string" ? payload.taskType.trim() : "";
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : row.title;
  const source = typeof payload.source === "string" && payload.source.trim() ? payload.source.trim() : row.source;
  const customerId = typeof payload.customerId === "string" && payload.customerId.trim() ? payload.customerId.trim() : null;
  const conversationId = typeof payload.conversationId === "string" && payload.conversationId.trim() ? payload.conversationId.trim() : null;
  const caseId = typeof payload.caseId === "string" && payload.caseId.trim() ? payload.caseId.trim() : null;
  const executionPayload = payload.executionPayload && typeof payload.executionPayload === "object" && !Array.isArray(payload.executionPayload)
    ? payload.executionPayload as Record<string, unknown>
    : {};
  const resultSummary = typeof payload.resultSummary === "string" ? payload.resultSummary.trim() : "";

  if (!sourceTaskId || !sourceTaskType) return;

  const artifacts = buildArtifacts({
    ...row,
    task_id: sourceTaskId,
    task_type: sourceTaskType,
    title,
    source,
    customer_id: customerId,
    conversation_id: conversationId,
    case_id: caseId
  }, executionPayload);
  const stored = await writeTaskArtifacts({
    tenantId: row.tenant_id,
    customerId,
    conversationId,
    taskId: sourceTaskId,
    artifacts
  });

  await db("async_task_artifacts").where({ task_id: sourceTaskId }).del();
  if (stored.stored.length > 0) {
    await db("async_task_artifacts").insert(
      stored.stored.map((item) => ({
        tenant_id: row.tenant_id,
        task_id: sourceTaskId,
        customer_id: customerId,
        conversation_id: conversationId,
        kind: item.kind,
        file_name: item.fileName,
        file_path: item.filePath,
        mime_type: item.mimeType,
        sequence_no: item.sequenceNo,
        size_bytes: item.sizeBytes,
        content_preview: item.contentPreview,
        metadata: JSON.stringify(item.metadata)
      }))
    );
  }

  await db("async_tasks")
    .where({ task_id: sourceTaskId, tenant_id: row.tenant_id })
    .update({
      artifact_dir: stored.dir,
      result_meta: JSON.stringify({
        artifactCount: stored.stored.length,
        source
      }),
      updated_at: new Date()
    });

  if (
    customerId &&
    resultSummary &&
    ![
      "vector_customer_profile_reindex",
      "vector_batch_reindex",
      "vector_memory_unit_reindex",
      "memory_encode_conversation_event",
      "memory_encode_task_event"
    ].includes(sourceTaskType)
  ) {
    await recordCustomerMemoryItem(db, {
      tenantId: row.tenant_id,
      customerId,
      conversationId,
      caseId,
      taskId: sourceTaskId,
      memoryType: sourceTaskType === "ai_execution_archive" ? "ai_execution" : "task_outcome",
      source: "task_engine",
      title,
      summary: resultSummary,
      content: {
        taskType: sourceTaskType,
        source,
        payload: executionPayload
      },
      confidence: sourceTaskType === "ai_execution_archive" ? 0.7 : 0.82,
      salience: sourceTaskType === "ai_execution_archive" ? 45 : 70
    });

    if (sourceTaskType === "capability_script_execution") {
      await upsertCustomerStateSnapshot(db, {
        tenantId: row.tenant_id,
        customerId,
        stateType: "capability_result",
        statePayload: executionPayload
      });
    }

    if (sourceTaskType !== "ai_execution_archive") {
      await scheduleLongTask({
        tenantId: row.tenant_id,
        customerId,
        conversationId,
        caseId,
        taskType: "memory_encode_task_event",
        title: `Memory encode ${title}`,
        source: "workflow",
        priority: 76,
        schedulerKey: `memory-task:${sourceTaskId}`,
        payload: {
          taskType: sourceTaskType,
          resultSummary,
          payload: executionPayload
        }
      });
    }
  }
}

async function enrichExecutionPayload(
  db: Knex,
  row: AsyncTaskRow,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (row.task_type === "capability_script_execution") {
    const capability = payload.capability && typeof payload.capability === "object" && !Array.isArray(payload.capability)
      ? payload.capability as {
          capabilityId: string;
          slug: string;
          name: string;
          description?: string | null;
        }
      : null;
    const script = payload.script && typeof payload.script === "object" && !Array.isArray(payload.script)
      ? payload.script as {
          scriptKey: string;
          name: string;
          fileName: string;
          language: string;
          sourceCode: string;
          requirements?: string[];
          envRefs?: string[];
          envBindings?: Array<{
            envKey: string;
            envValue: string;
          }>;
        }
      : null;
    if (!capability?.capabilityId) throw new Error("capability_script_execution missing capability");
    if (!script?.scriptKey) throw new Error("capability_script_execution missing script");
    const result = await runCapabilityScriptExecution({
      tenantId: row.tenant_id,
      customerId: row.customer_id,
      conversationId: row.conversation_id,
      capability,
      script,
      args: payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
        ? payload.args as Record<string, unknown>
        : {}
    });
    return { ...payload, ...result };
  }

  if (row.task_type === "vector_customer_profile_reindex") {
    const customerId = typeof payload.customerId === "string" ? payload.customerId.trim() : row.customer_id ?? "";
    if (!customerId) throw new Error("vector_customer_profile_reindex missing customerId");
    const result = await runVectorCustomerProfileReindex(db, {
      tenantId: row.tenant_id,
      customerId,
      expectedSourceVersion: typeof payload.expectedSourceVersion === "number" ? payload.expectedSourceVersion : undefined
    });
    return { ...payload, ...result };
  }

  if (row.task_type === "vector_batch_reindex") {
    const customerIds = Array.isArray(payload.customerIds) ? payload.customerIds.map(String) : undefined;
    const limit = typeof payload.limit === "number" ? payload.limit : undefined;
    const result = await runVectorBatchReindex(db, {
      tenantId: row.tenant_id,
      customerIds,
      limit
    });
    return { ...payload, ...result };
  }

  if (row.task_type === "vector_memory_unit_reindex") {
    const memoryUnitId = typeof payload.memoryUnitId === "string" ? payload.memoryUnitId.trim() : "";
    if (!memoryUnitId) throw new Error("vector_memory_unit_reindex missing memoryUnitId");
    const result = await runVectorMemoryUnitReindex(db, {
      tenantId: row.tenant_id,
      memoryUnitId
    });
    return { ...payload, ...result };
  }

  if (row.task_type === "memory_encode_conversation_event") {
    if (!row.customer_id) throw new Error("memory_encode_conversation_event missing customer");
    const messages = Array.isArray(payload.messages)
      ? payload.messages
          .filter((item) => item && typeof item === "object" && !Array.isArray(item))
          .map((item) => {
            const record = item as Record<string, unknown>;
            return {
              role: record.role === "assistant" ? "assistant" : "user",
              content: typeof record.content === "string" ? record.content : ""
            } as const;
          })
          .filter((item) => item.content.trim())
      : [];
    const result = await encodeConversationMemories(db, {
      tenantId: row.tenant_id,
      customerId: row.customer_id,
      conversationId: row.conversation_id ?? "",
      caseId: row.case_id,
      messages,
      conversationSummary: typeof payload.conversationSummary === "string" ? payload.conversationSummary : "",
      lastIntent: typeof payload.lastIntent === "string" ? payload.lastIntent : "general_inquiry",
      lastSentiment: typeof payload.lastSentiment === "string" ? payload.lastSentiment : "neutral",
      finalResponse: typeof payload.finalResponse === "string" ? payload.finalResponse : null
    });
    return { ...payload, ...result };
  }

  if (row.task_type === "memory_encode_task_event") {
    if (!row.customer_id) throw new Error("memory_encode_task_event missing customer");
    const taskPayload = payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
      ? payload.payload as Record<string, unknown>
      : payload;
    const result = await encodeTaskOutcomeMemories(db, {
      tenantId: row.tenant_id,
      customerId: row.customer_id,
      conversationId: row.conversation_id,
      caseId: row.case_id,
      taskId: row.task_id,
      taskType: typeof payload.taskType === "string" ? payload.taskType : row.task_type,
      title: row.title,
      resultSummary: typeof payload.resultSummary === "string" ? payload.resultSummary : summarizeTask(row, payload),
      payload: taskPayload
    });
    return { ...payload, ...result };
  }
  return payload;
}
