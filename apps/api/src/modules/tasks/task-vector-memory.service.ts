import type { Knex } from "knex";

import { scheduleLongTask } from "./task-scheduler.service.js";
import {
  syncCustomerMemoryUnitVector,
  syncCustomerProfileVector
} from "../memory/vector-memory.service.js";

function computeNextRetry(attemptCount: number) {
  const baseMinutes = Math.min(12 * 60, 2 ** Math.max(0, attemptCount - 1) * 5);
  return new Date(Date.now() + baseMinutes * 60 * 1000);
}

function extractProfileKeywords(summary: string) {
  return Array.from(
    new Set(
      summary
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  )
    .slice(0, 40)
    .join(" ");
}

export async function scheduleCustomerProfileVectorSync(input: {
  tenantId: string;
  customerId: string;
  expectedSourceVersion?: number;
  priority?: number;
}) {
  await scheduleLongTask({
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: null,
    taskType: "vector_customer_profile_reindex",
    title: `Vector reindex ${input.customerId}`,
    source: "workflow",
    priority: input.priority ?? 70,
    schedulerKey: input.expectedSourceVersion
      ? `customer-memory-profile:${input.customerId}:${input.expectedSourceVersion}`
      : undefined,
    payload: {
      customerId: input.customerId,
      expectedSourceVersion: input.expectedSourceVersion
    }
  });
}

export async function scheduleMemoryUnitVectorSync(input: {
  tenantId: string;
  customerId: string;
  memoryUnitId: string;
  priority?: number;
}) {
  await scheduleLongTask({
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: null,
    taskType: "vector_memory_unit_reindex",
    title: `Vector memory ${input.memoryUnitId}`,
    source: "workflow",
    priority: input.priority ?? 72,
    schedulerKey: `customer-memory-unit:${input.memoryUnitId}`,
    payload: {
      customerId: input.customerId,
      memoryUnitId: input.memoryUnitId
    }
  });
}

export async function buildCustomerProfileSummary(
  db: Knex,
  input: { tenantId: string; customerId: string }
) {
  const profile = await db("customer_memory_profiles")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId })
    .select("profile_summary", "conversation_count", "last_intent", "last_sentiment")
    .first<{
      profile_summary: string | null;
      conversation_count: number | null;
      last_intent: string | null;
      last_sentiment: string | null;
    } | undefined>();
  return {
    summary: String(profile?.profile_summary ?? ""),
    conversationCount: Number(profile?.conversation_count ?? 0),
    latestIntent: String(profile?.last_intent ?? "general_inquiry"),
    latestSentiment: String(profile?.last_sentiment ?? "neutral")
  };
}

async function markProfileIndexed(
  db: Knex,
  input: { tenantId: string; customerId: string; reason: string; indexed: boolean }
) {
  await db("customer_memory_profiles")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId })
    .update({
      indexed_version: db.raw("GREATEST(indexed_version, source_version)"),
      dirty: false,
      dirty_reason: input.indexed ? null : input.reason,
      index_status: input.indexed ? "indexed" : "failed",
      index_last_error: input.indexed ? null : input.reason,
      next_retry_at: input.indexed ? null : computeNextRetry(1),
      last_indexed_at: db.fn.now(),
      claimed_at: null,
      claimed_by: null,
      updated_at: db.fn.now()
    });
}

export async function runVectorCustomerProfileReindex(
  db: Knex,
  input: { tenantId: string; customerId: string; expectedSourceVersion?: number }
) {
  const profileRow = await db("customer_memory_profiles")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId })
    .select("source_version", "index_attempt_count")
    .first<{ source_version: number; index_attempt_count: number } | undefined>();

  if (!profileRow) {
    return {
      customerId: input.customerId,
      indexed: false,
      reason: "profile_not_found"
    };
  }

  if (
    typeof input.expectedSourceVersion === "number" &&
    profileRow.source_version !== input.expectedSourceVersion
  ) {
    return {
      customerId: input.customerId,
      indexed: false,
      skipped: true,
      reason: "stale_source_version",
      sourceVersion: profileRow.source_version
    };
  }

  const built = await buildCustomerProfileSummary(db, input);
  const summary = built.summary.trim();
  const profileKeywords = summary ? extractProfileKeywords(summary) : "";

  await db("customer_memory_profiles")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId })
    .update({
      profile_keywords: profileKeywords,
      index_status: "indexing",
      index_attempt_count: db.raw("index_attempt_count + 1"),
      index_last_error: null,
      next_retry_at: null,
      updated_at: db.fn.now()
    });

  if (!summary) {
    await db("customer_memory_profiles")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .update({
        indexed_version: db.raw("GREATEST(indexed_version, source_version)"),
        dirty: false,
        dirty_reason: "no_customer_memory",
        index_status: "indexed",
        index_last_error: null,
        next_retry_at: null,
        last_indexed_at: db.fn.now(),
        claimed_at: null,
        claimed_by: null,
        updated_at: db.fn.now()
      });

    return {
      customerId: input.customerId,
      indexed: false,
      reason: "no_customer_memory",
      conversationCount: built.conversationCount
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await markProfileIndexed(db, {
      tenantId: input.tenantId,
      customerId: input.customerId,
      reason: "missing_api_key",
      indexed: false
    });
    return {
      customerId: input.customerId,
      indexed: false,
      reason: "missing_api_key",
      conversationCount: built.conversationCount,
      summaryPreview: summary.slice(0, 300)
    };
  }

  try {
    const indexed = await syncCustomerProfileVector({
      tenantId: input.tenantId,
      customerId: input.customerId,
      profileText: summary,
      apiKey
    });

    if (!indexed) {
      const attemptCount = Number(profileRow.index_attempt_count ?? 0) + 1;
      await db("customer_memory_profiles")
        .where({ tenant_id: input.tenantId, customer_id: input.customerId })
        .update({
          index_status: "failed",
          index_last_error: "vector_index_failed",
          next_retry_at: computeNextRetry(attemptCount),
          claimed_at: null,
          claimed_by: null,
          updated_at: db.fn.now()
        });
    } else {
      await db("customer_memory_profiles")
        .where({ tenant_id: input.tenantId, customer_id: input.customerId })
        .update({
          indexed_version: db.raw("GREATEST(indexed_version, source_version)"),
          dirty: false,
          dirty_reason: null,
          index_status: "indexed",
          index_last_error: null,
          next_retry_at: null,
          last_indexed_at: db.fn.now(),
          claimed_at: null,
          claimed_by: null,
          updated_at: db.fn.now()
        });
    }

    return {
      customerId: input.customerId,
      indexed,
      conversationCount: built.conversationCount,
      summaryPreview: summary.slice(0, 300)
    };
  } catch (error) {
    const attemptCount = Number(profileRow.index_attempt_count ?? 0) + 1;
    await db("customer_memory_profiles")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .update({
        index_status: "failed",
        index_last_error: (error as Error).message.slice(0, 1000),
        next_retry_at: computeNextRetry(attemptCount),
        claimed_at: null,
        claimed_by: null,
        updated_at: db.fn.now()
      });
    throw error;
  }
}

export async function runVectorMemoryUnitReindex(
  db: Knex,
  input: { tenantId: string; memoryUnitId: string }
) {
  const row = await db("customer_memory_units")
    .where({ tenant_id: input.tenantId, memory_unit_id: input.memoryUnitId })
    .select("customer_id", "memory_type", "embedding_input", "index_attempt_count")
    .first<{
      customer_id: string;
      memory_type: string;
      embedding_input: string | null;
      index_attempt_count: number | null;
    } | undefined>();

  if (!row) {
    return {
      memoryUnitId: input.memoryUnitId,
      indexed: false,
      reason: "memory_unit_not_found"
    };
  }

  const memoryText = String(row.embedding_input ?? "").trim();
  await db("customer_memory_units")
    .where({ tenant_id: input.tenantId, memory_unit_id: input.memoryUnitId })
    .update({
      index_status: "indexing",
      index_attempt_count: db.raw("index_attempt_count + 1"),
      index_last_error: null,
      next_retry_at: null,
      updated_at: db.fn.now()
    });

  if (!memoryText) {
    await db("customer_memory_units")
      .where({ tenant_id: input.tenantId, memory_unit_id: input.memoryUnitId })
      .update({
        index_status: "failed",
        index_last_error: "missing_embedding_input",
        next_retry_at: computeNextRetry(Number(row.index_attempt_count ?? 0) + 1),
        updated_at: db.fn.now()
      });
    return {
      memoryUnitId: input.memoryUnitId,
      indexed: false,
      reason: "missing_embedding_input"
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await db("customer_memory_units")
      .where({ tenant_id: input.tenantId, memory_unit_id: input.memoryUnitId })
      .update({
        index_status: "failed",
        index_last_error: "missing_api_key",
        next_retry_at: computeNextRetry(Number(row.index_attempt_count ?? 0) + 1),
        updated_at: db.fn.now()
      });
    return {
      memoryUnitId: input.memoryUnitId,
      indexed: false,
      reason: "missing_api_key"
    };
  }

  try {
    const indexed = await syncCustomerMemoryUnitVector({
      tenantId: input.tenantId,
      customerId: String(row.customer_id),
      memoryUnitId: input.memoryUnitId,
      memoryText,
      memoryType: String(row.memory_type),
      apiKey
    });

    await db("customer_memory_units")
      .where({ tenant_id: input.tenantId, memory_unit_id: input.memoryUnitId })
      .update(indexed
        ? {
            index_status: "indexed",
            index_last_error: null,
            next_retry_at: null,
            indexed_at: db.fn.now(),
            updated_at: db.fn.now()
          }
        : {
            index_status: "failed",
            index_last_error: "vector_index_failed",
            next_retry_at: computeNextRetry(Number(row.index_attempt_count ?? 0) + 1),
            updated_at: db.fn.now()
          });

    return {
      memoryUnitId: input.memoryUnitId,
      indexed
    };
  } catch (error) {
    await db("customer_memory_units")
      .where({ tenant_id: input.tenantId, memory_unit_id: input.memoryUnitId })
      .update({
        index_status: "failed",
        index_last_error: (error as Error).message.slice(0, 1000),
        next_retry_at: computeNextRetry(Number(row.index_attempt_count ?? 0) + 1),
        updated_at: db.fn.now()
      });
    throw error;
  }
}

export async function runVectorBatchReindex(
  db: Knex,
  input: { tenantId: string; customerIds?: string[]; limit?: number }
) {
  const ids = Array.isArray(input.customerIds)
    ? Array.from(new Set(input.customerIds.map((item) => String(item).trim()).filter(Boolean)))
    : [];

  const [customerRows, memoryRows] = await Promise.all([
    ids.length > 0
      ? db("customers")
          .where({ tenant_id: input.tenantId })
          .whereIn("customer_id", ids)
          .select("customer_id")
      : db("customer_memory_profiles")
          .where({ tenant_id: input.tenantId })
          .select("customer_id")
          .orderBy("source_updated_at", "desc")
          .limit(Math.max(1, Math.min(input.limit ?? 100, 500))),
    ids.length > 0
      ? db("customer_memory_units")
          .where({ tenant_id: input.tenantId, status: "active" })
          .whereIn("customer_id", ids)
          .select("memory_unit_id", "customer_id")
          .orderBy("updated_at", "desc")
          .limit(Math.max(1, Math.min((input.limit ?? 100) * 4, 2000)))
      : db("customer_memory_units")
          .where({ tenant_id: input.tenantId, status: "active" })
          .select("memory_unit_id", "customer_id")
          .orderBy("updated_at", "desc")
          .limit(Math.max(1, Math.min((input.limit ?? 100) * 4, 2000)))
  ]);

  const customerIds = customerRows.map((row) => String(row.customer_id));
  for (const customerId of customerIds) {
    await scheduleCustomerProfileVectorSync({
      tenantId: input.tenantId,
      customerId
    });
  }

  for (const row of memoryRows) {
    await scheduleMemoryUnitVectorSync({
      tenantId: input.tenantId,
      customerId: String(row.customer_id),
      memoryUnitId: String(row.memory_unit_id)
    });
  }

  return {
    queuedCustomerIds: customerIds,
    queuedMemoryUnitIds: memoryRows.map((row) => String(row.memory_unit_id)),
    queuedCount: customerIds.length + memoryRows.length
  };
}
