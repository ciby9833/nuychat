import type { Knex } from "knex";

import { scheduleLongTask } from "./task-scheduler.service.js";
import { upsertCustomerProfile } from "../memory/vector-memory.service.js";

function toIso(value: unknown) {
  return new Date(String(value)).toISOString();
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

export async function buildCustomerProfileSummary(
  db: Knex,
  input: { tenantId: string; customerId: string; maxConversations?: number }
) {
  const [profile, rows, memoryRows] = await Promise.all([
    db("customer_profiles")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .select("profile_summary", "soul_profile", "state_snapshot", "last_intent", "last_sentiment")
      .first<Record<string, unknown> | undefined>(),
    db("conversations as c")
      .leftJoin("conversation_intelligence as ci", function joinSummary() {
        this.on("ci.conversation_id", "=", "c.conversation_id").andOn("ci.tenant_id", "=", "c.tenant_id");
      })
      .where({ "c.tenant_id": input.tenantId, "c.customer_id": input.customerId })
      .whereNotNull("ci.summary")
      .select("c.conversation_id", "c.channel_type", "c.updated_at", "ci.summary", "ci.last_intent", "ci.last_sentiment")
      .orderBy("c.updated_at", "desc")
      .limit(input.maxConversations ?? 8),
    db("customer_memory_items")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
      .select("memory_type", "summary", "salience", "updated_at")
      .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
      .limit(10)
  ]);

  const conversationSummary = rows
    .map((row) => {
      const parts = [
        `[${toIso(row.updated_at)}]`,
        `channel=${String(row.channel_type)}`,
        row.last_intent ? `intent=${String(row.last_intent)}` : null,
        row.last_sentiment ? `sentiment=${String(row.last_sentiment)}` : null,
        typeof row.summary === "string" ? row.summary : null
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .join("\n");

  const memorySummary = memoryRows
    .map((row) => `[${String(row.memory_type)}] ${String(row.summary ?? "").slice(0, 180)}`)
    .join("\n");

  const profileSummary = typeof profile?.profile_summary === "string" ? profile.profile_summary : "";
  const summary = [profileSummary, conversationSummary, memorySummary].filter(Boolean).join("\n\n");

  return {
    summary,
    conversationCount: rows.length,
    latestIntent: typeof profile?.last_intent === "string" ? profile.last_intent : "general_inquiry",
    latestSentiment: typeof profile?.last_sentiment === "string" ? profile.last_sentiment : "neutral"
  };
}

export async function runVectorCustomerProfileReindex(
  db: Knex,
  input: { tenantId: string; customerId: string; expectedSourceVersion?: number }
) {
  const built = await buildCustomerProfileSummary(db, input);
  if (!built.summary.trim()) {
    await db("customer_profiles")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        soul_profile: "{}",
        operating_notes: "{}",
        state_snapshot: "{}",
        profile_summary: "",
        profile_keywords: "",
        conversation_count: built.conversationCount,
        last_intent: built.latestIntent,
        last_sentiment: built.latestSentiment,
        dirty: false,
        dirty_reason: "no_customer_intelligence",
        last_indexed_at: db.fn.now()
      })
      .onConflict(["tenant_id", "customer_id"])
      .merge({
        profile_summary: "",
        profile_keywords: "",
        conversation_count: built.conversationCount,
        last_intent: built.latestIntent,
        last_sentiment: built.latestSentiment,
        dirty: false,
        dirty_reason: "no_customer_intelligence",
        last_indexed_at: db.fn.now()
      });

    return {
      customerId: input.customerId,
      indexed: false,
      reason: "no_customer_intelligence",
      conversationCount: built.conversationCount
    };
  }

  const profileKeywords = extractProfileKeywords(built.summary);

  await db("customer_profiles")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      soul_profile: "{}",
      operating_notes: "{}",
      state_snapshot: "{}",
      profile_summary: built.summary,
      profile_keywords: profileKeywords,
      conversation_count: built.conversationCount,
      last_intent: built.latestIntent,
      last_sentiment: built.latestSentiment,
      dirty: true,
      dirty_reason: "vector_reindex_requested",
      last_indexed_at: db.fn.now(),
      indexed_version: 0
    })
    .onConflict(["tenant_id", "customer_id"])
    .merge({
      profile_summary: built.summary,
      profile_keywords: profileKeywords,
      conversation_count: built.conversationCount,
      last_intent: built.latestIntent,
      last_sentiment: built.latestSentiment,
      dirty: true,
      dirty_reason: "vector_reindex_requested",
      last_indexed_at: db.fn.now(),
      updated_at: db.fn.now()
    });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const current = await db("customer_profiles")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .select("source_version")
      .first<{ source_version: number } | undefined>();

    const expected = Number(input.expectedSourceVersion ?? current?.source_version ?? 0);

    await db("customer_profiles")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .update({
        indexed_version: db.raw("GREATEST(indexed_version, ?)", [expected]),
        dirty: db.raw("source_version > ?", [expected]),
        dirty_reason: db.raw("CASE WHEN source_version > ? THEN dirty_reason ELSE NULL END", [expected]),
        claimed_at: null,
        claimed_by: null,
        updated_at: db.fn.now()
      });

    return {
      customerId: input.customerId,
      indexed: false,
      reason: "missing_api_key",
      conversationCount: built.conversationCount,
      summaryPreview: built.summary.slice(0, 300)
    };
  }

  await upsertCustomerProfile({
    customerId: input.customerId,
    tenantId: input.tenantId,
    summary: built.summary,
    apiKey
  });

  const expected = Number(input.expectedSourceVersion ?? 0);
  await db("customer_profiles")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId })
    .update({
      last_indexed_at: db.fn.now(),
      indexed_version: db.raw("GREATEST(indexed_version, ?)", [expected > 0 ? expected : 0]),
      dirty: expected > 0 ? db.raw("source_version > ?", [expected]) : false,
      dirty_reason: expected > 0
        ? db.raw("CASE WHEN source_version > ? THEN dirty_reason ELSE NULL END", [expected])
        : null,
      claimed_at: null,
      claimed_by: null,
      updated_at: db.fn.now()
    });

  return {
    customerId: input.customerId,
    indexed: true,
    conversationCount: built.conversationCount,
    summaryPreview: built.summary.slice(0, 300)
  };
}

export async function runVectorBatchReindex(
  db: Knex,
  input: { tenantId: string; customerIds?: string[]; limit?: number }
) {
  const ids = Array.isArray(input.customerIds)
    ? Array.from(new Set(input.customerIds.map((item) => String(item).trim()).filter(Boolean)))
    : [];

  const customerRows = ids.length > 0
    ? await db("customers")
        .where({ tenant_id: input.tenantId })
        .whereIn("customer_id", ids)
        .select("customer_id")
        .orderBy("updated_at", "desc")
    : await db("customers")
        .where({ tenant_id: input.tenantId })
        .select("customer_id")
        .orderBy("updated_at", "desc")
        .limit(Math.max(1, Math.min(input.limit ?? 100, 500)));

  const customerIds = customerRows.map((row) => String(row.customer_id));
  for (const customerId of customerIds) {
    await scheduleLongTask({
      tenantId: input.tenantId,
      customerId,
      conversationId: null,
      taskType: "vector_customer_profile_reindex",
      title: `Vector reindex ${customerId}`,
      source: "workflow",
      priority: 70,
      payload: { customerId }
    });
  }

  return {
    queuedCustomerIds: customerIds,
    queuedCount: customerIds.length
  };
}
