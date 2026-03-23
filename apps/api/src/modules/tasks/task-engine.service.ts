import type { Knex } from "knex";

import { writeTaskArtifacts, type TaskArtifactInput } from "./task-storage.service.js";
import { runExternalOrderLookup, runExternalShipmentTracking } from "./task-external.service.js";
import { runVectorBatchReindex, runVectorCustomerProfileReindex } from "./task-vector-memory.service.js";
import { recordCustomerMemoryItem, upsertCustomerStateSnapshot } from "../memory/customer-intelligence.service.js";

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

  if (row.task_type === "lookup_order_external") {
    return [
      `Order lookup completed`,
      typeof payload.orderId === "string" ? `orderId=${payload.orderId}` : null,
      typeof payload.status === "string" ? `status=${payload.status}` : null
    ].filter(Boolean).join(" | ");
  }

  if (row.task_type === "track_shipment_external") {
    return [
      `Shipment tracking completed`,
      typeof payload.trackingNumber === "string" ? `tracking=${payload.trackingNumber}` : null,
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

  if (row.task_type === "lookup_order_external" || row.task_type === "track_shipment_external") {
    artifacts.push({
      kind: "result",
      fileName: "result.json",
      content: toPrettyJson(payload),
      mimeType: "application/json"
    });
  }

  if (row.task_type === "vector_customer_profile_reindex" || row.task_type === "vector_batch_reindex") {
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
  const executionPayload = await enrichExecutionPayload(db, row, payload);
  const artifacts = buildArtifacts(row, executionPayload);
  const stored = await writeTaskArtifacts({
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    conversationId: row.conversation_id,
    taskId: row.task_id,
    artifacts
  });

  await db("async_task_artifacts").where({ task_id: taskId }).del();
  if (stored.stored.length > 0) {
    await db("async_task_artifacts").insert(
      stored.stored.map((item) => ({
        tenant_id: row.tenant_id,
        task_id: row.task_id,
        customer_id: row.customer_id,
        conversation_id: row.conversation_id,
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

  const resultSummary = summarizeTask(row, executionPayload);
  const resultMeta = {
    artifactCount: stored.stored.length,
    source: row.source
  };

  if (row.customer_id && resultSummary) {
    await recordCustomerMemoryItem(db, {
      tenantId: row.tenant_id,
      customerId: row.customer_id,
      conversationId: row.conversation_id,
      caseId: row.case_id,
      taskId: row.task_id,
      memoryType: row.task_type === "ai_execution_archive" ? "ai_execution" : "task_outcome",
      source: "task_engine",
      title: row.title,
      summary: resultSummary,
      content: {
        taskType: row.task_type,
        source: row.source,
        payload: executionPayload
      },
      confidence: row.task_type === "ai_execution_archive" ? 0.7 : 0.82,
      salience: row.task_type === "ai_execution_archive" ? 45 : 70
    });

    if (row.task_type === "lookup_order_external" || row.task_type === "track_shipment_external") {
      await upsertCustomerStateSnapshot(db, {
        tenantId: row.tenant_id,
        customerId: row.customer_id,
        stateType: row.task_type === "lookup_order_external" ? "order_status" : "shipment_status",
        statePayload: executionPayload
      });
    }
  }

  return {
    row,
    payload: executionPayload,
    artifactDir: stored.dir,
    resultSummary,
    resultMeta
  };
}

async function enrichExecutionPayload(
  db: Knex,
  row: AsyncTaskRow,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (row.task_type === "lookup_order_external") {
    const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
    if (!orderId) throw new Error("lookup_order_external missing orderId");
    const result = await runExternalOrderLookup(db, {
      tenantId: row.tenant_id,
      orderId
    });
    return { ...payload, ...result };
  }

  if (row.task_type === "track_shipment_external") {
    const trackingNumber = typeof payload.trackingNumber === "string" ? payload.trackingNumber.trim() : "";
    if (!trackingNumber) throw new Error("track_shipment_external missing trackingNumber");
    const carrier = typeof payload.carrier === "string" && payload.carrier.trim() ? payload.carrier.trim() : "JNE";
    const result = await runExternalShipmentTracking(db, {
      tenantId: row.tenant_id,
      trackingNumber,
      carrier
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
  return payload;
}
