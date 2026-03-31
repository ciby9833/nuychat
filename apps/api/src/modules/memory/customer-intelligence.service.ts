import crypto from "node:crypto";
import type { Knex } from "knex";

import { redisConnection } from "../../infra/redis/client.js";
import { searchRelevantMemoryVectors } from "./vector-memory.service.js";
import {
  scheduleCustomerProfileVectorSync,
  scheduleMemoryUnitVectorSync
} from "../tasks/task-vector-memory.service.js";

export interface WorkingMemoryTurn {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface ConversationInsight {
  summary: string;
  lastIntent: string;
  lastSentiment: string;
  messageCount: number;
  keyEntities: {
    orderIds: string[];
    phones: string[];
    addresses: string[];
  };
}

export interface CustomerProfileSnapshot {
  soulProfile: Record<string, unknown>;
  operatingNotes: Record<string, unknown>;
  stateSnapshot: Record<string, unknown>;
  profileSummary: string;
  profileKeywords: string;
  lastIntent: string;
  lastSentiment: string;
  conversationCount: number;
  memoryItemCount: number;
}

type MemoryUnitRow = {
  memory_unit_id: string;
  memory_type: string;
  title: string | null;
  summary: string | null;
  detail: string | null;
  salience: number | null;
  confidence: string | number | null;
  updated_at: string | null;
};

type RetrievedMemoryUnit = MemoryUnitRow & {
  lexical_score?: number;
  vector_score?: number;
  blended_score?: number;
};

const WORKING_MEMORY_TTL_SECS = 4 * 60 * 60;
const MAX_WORKING_MEMORY_TURNS = 20;
const WM_CONTEXT_TURNS = 6;

function wmKey(conversationId: string): string {
  return `wm:${conversationId}`;
}

function parseObject(value: unknown): Record<string, unknown> {
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

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeKeywords(input: string) {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  )
    .slice(0, 64)
    .join(" ");
}

function buildFingerprint(parts: Array<string | null | undefined>) {
  return crypto
    .createHash("sha1")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex");
}

function toNumber(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toIsoString(value: unknown) {
  return new Date(String(value)).toISOString();
}

function buildMemoryEmbeddingText(input: {
  memoryType: string;
  title?: string | null;
  summary: string;
  detail?: string | null;
}) {
  return [
    `type=${input.memoryType}`,
    input.title ? `title=${input.title}` : null,
    input.summary,
    input.detail ?? null
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3500);
}

function mergeEntityArrays(values: string[][]) {
  return Array.from(new Set(values.flat().map((item) => item.trim()).filter(Boolean)));
}

export async function getWorkingMemory(conversationId: string): Promise<WorkingMemoryTurn[]> {
  const raw = await redisConnection.get(wmKey(conversationId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WorkingMemoryTurn[];
  } catch {
    return [];
  }
}

export async function appendWorkingMemory(conversationId: string, turns: WorkingMemoryTurn[]): Promise<void> {
  const existing = await getWorkingMemory(conversationId);
  const updated = [...existing, ...turns].slice(-MAX_WORKING_MEMORY_TURNS);
  await redisConnection.setex(wmKey(conversationId), WORKING_MEMORY_TTL_SECS, JSON.stringify(updated));
}

export async function clearWorkingMemory(conversationId: string): Promise<void> {
  await redisConnection.del(wmKey(conversationId));
}

export async function getConversationInsightRecord(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string
): Promise<ConversationInsight | null> {
  const row = await db("conversation_memory_snapshots")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .select("summary", "intent", "sentiment", "message_count", "key_entities")
    .first<{
      summary: string | null;
      intent: string | null;
      sentiment: string | null;
      message_count: number | null;
      key_entities: unknown;
    } | undefined>();

  if (!row) return null;
  const keyEntities = parseObject(row.key_entities);

  return {
    summary: String(row.summary ?? ""),
    lastIntent: String(row.intent ?? "general_inquiry"),
    lastSentiment: String(row.sentiment ?? "neutral"),
    messageCount: Number(row.message_count ?? 0),
    keyEntities: {
      orderIds: parseStringArray(keyEntities.orderIds),
      phones: parseStringArray(keyEntities.phones),
      addresses: parseStringArray(keyEntities.addresses)
    }
  };
}

export async function getCustomerProfileRecord(
  db: Knex | Knex.Transaction,
  tenantId: string,
  customerId: string
): Promise<CustomerProfileSnapshot | null> {
  const row = await db("customer_memory_profiles")
    .where({ tenant_id: tenantId, customer_id: customerId })
    .first<Record<string, unknown> | undefined>();

  if (!row) return null;

  return {
    soulProfile: parseObject(row.soul_profile),
    operatingNotes: parseObject(row.operating_notes),
    stateSnapshot: parseObject(row.state_snapshot),
    profileSummary: String(row.profile_summary ?? ""),
    profileKeywords: String(row.profile_keywords ?? ""),
    lastIntent: String(row.last_intent ?? "general_inquiry"),
    lastSentiment: String(row.last_sentiment ?? "neutral"),
    conversationCount: Number(row.conversation_count ?? 0),
    memoryItemCount: Number(row.memory_item_count ?? 0)
  };
}

async function rebuildCustomerProfile(
  db: Knex | Knex.Transaction,
  input: { tenantId: string; customerId: string; dirtyReason: string }
) {
  const [customer, snapshots, memoryUnits, states] = await Promise.all([
    db("customers")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .select("display_name", "tier", "language", "tags", "metadata")
      .first<Record<string, unknown> | undefined>(),
    db("conversation_memory_snapshots")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .select("summary", "intent", "sentiment", "updated_at", "key_entities", "last_customer_goal", "last_resolution")
      .orderBy("updated_at", "desc")
      .limit(10),
    db("customer_memory_units")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
      .where((builder) => {
        builder.whereNull("expires_at").orWhere("expires_at", ">", db.fn.now());
      })
      .select("memory_type", "title", "summary", "detail", "payload", "salience", "confidence", "updated_at")
      .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
      .limit(18),
    db("customer_memory_states")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
      .select("state_type", "summary", "state_payload", "confidence", "updated_at")
      .orderBy("updated_at", "desc")
      .limit(8)
  ]);

  const stablePreferences = memoryUnits
    .filter((row) => ["preference", "fact", "profile_trait"].includes(String(row.memory_type)))
    .map((row) => String(row.summary ?? ""))
    .filter(Boolean)
    .slice(0, 8);

  const recentIssues = snapshots
    .map((row) => {
      const parts = [
        `[${toIsoString(row.updated_at)}]`,
        row.intent ? `intent=${String(row.intent)}` : null,
        row.sentiment ? `sentiment=${String(row.sentiment)}` : null,
        typeof row.last_customer_goal === "string" && row.last_customer_goal.trim()
          ? `goal=${row.last_customer_goal.trim()}`
          : null,
        typeof row.summary === "string" ? row.summary.slice(0, 200) : null
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .filter(Boolean)
    .slice(0, 8);

  const importantMemories = memoryUnits
    .map((row) => {
      const detail = typeof row.detail === "string" && row.detail.trim() ? `detail=${row.detail.slice(0, 120)}` : null;
      return [
        `[${String(row.memory_type)}]`,
        typeof row.title === "string" && row.title.trim() ? row.title.trim() : null,
        String(row.summary ?? "").slice(0, 180),
        detail
      ].filter(Boolean).join(" | ");
    })
    .slice(0, 10);

  const stateSnapshot = Object.fromEntries(
    states.map((row) => [String(row.state_type), parseObject(row.state_payload)])
  );

  const baseFacts = [
    customer?.display_name ? `customer=${String(customer.display_name)}` : null,
    customer?.tier ? `tier=${String(customer.tier)}` : null,
    customer?.language ? `language=${String(customer.language)}` : null,
    Array.isArray(customer?.tags) && customer.tags.length > 0 ? `tags=${(customer.tags as unknown[]).map(String).join(",")}` : null
  ].filter(Boolean);

  const profileSummary = [
    baseFacts.join(" | "),
    stablePreferences.length > 0 ? `[PREFERENCES]\n${stablePreferences.join("\n")}` : null,
    states.length > 0
      ? `[ACTIVE STATE]\n${states.map((row) => `${String(row.state_type)} | ${String(row.summary ?? "").slice(0, 180)}`).join("\n")}`
      : null,
    recentIssues.length > 0 ? `[RECENT EPISODES]\n${recentIssues.join("\n")}` : null,
    importantMemories.length > 0 ? `[LONG-TERM MEMORY]\n${importantMemories.join("\n")}` : null
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6500);

  const latestSnapshot = snapshots[0] as {
    intent?: unknown;
    sentiment?: unknown;
  } | undefined;

  const soulProfile = {
    tier: customer?.tier ?? "standard",
    language: customer?.language ?? "id",
    traits: stablePreferences.slice(0, 6),
    tags: Array.isArray(customer?.tags) ? customer.tags : []
  };

  const operatingNotes = {
    lastUpdatedAt: new Date().toISOString(),
    dirtyReason: input.dirtyReason,
    activeStateTypes: Object.keys(stateSnapshot),
    stablePreferenceCount: stablePreferences.length,
    recentEpisodeCount: recentIssues.length
  };

  const profileKeywords = normalizeKeywords(`${profileSummary}\n${stablePreferences.join(" ")}\n${importantMemories.join(" ")}`);

  await db("customer_memory_profiles")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      soul_profile: JSON.stringify(soulProfile),
      operating_notes: JSON.stringify(operatingNotes),
      state_snapshot: JSON.stringify(stateSnapshot),
      profile_summary: profileSummary,
      profile_keywords: profileKeywords,
      last_intent: String(latestSnapshot?.intent ?? "general_inquiry"),
      last_sentiment: String(latestSnapshot?.sentiment ?? "neutral"),
      memory_item_count: memoryUnits.length,
      conversation_count: snapshots.length,
      dirty: true,
      dirty_reason: input.dirtyReason,
      index_status: "pending",
      index_last_error: null,
      next_retry_at: null,
      source_version: 1,
      indexed_version: 0,
      source_updated_at: db.fn.now(),
      last_indexed_at: db.fn.now()
    })
    .onConflict(["tenant_id", "customer_id"])
    .merge({
      soul_profile: JSON.stringify(soulProfile),
      operating_notes: JSON.stringify(operatingNotes),
      state_snapshot: JSON.stringify(stateSnapshot),
      profile_summary: profileSummary,
      profile_keywords: profileKeywords,
      last_intent: String(latestSnapshot?.intent ?? "general_inquiry"),
      last_sentiment: String(latestSnapshot?.sentiment ?? "neutral"),
      memory_item_count: memoryUnits.length,
      conversation_count: snapshots.length,
      dirty: true,
      dirty_reason: input.dirtyReason,
      index_status: "pending",
      index_last_error: null,
      next_retry_at: null,
      source_version: db.raw("customer_memory_profiles.source_version + 1"),
      source_updated_at: db.fn.now(),
      claimed_at: null,
      claimed_by: null,
      updated_at: db.fn.now()
    });

  void scheduleCustomerProfileVectorSync({
    tenantId: input.tenantId,
    customerId: input.customerId
  }).catch(() => null);
}

async function upsertDerivedMemoryUnit(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    caseId?: string | null;
    memoryType: string;
    title?: string | null;
    summary: string;
    detail?: string | null;
    payload?: Record<string, unknown>;
    source: string;
    salience: number;
    confidence: number;
    fingerprint: string;
  }
) {
  const embeddingText = buildMemoryEmbeddingText({
    memoryType: input.memoryType,
    title: input.title ?? null,
    summary: input.summary,
    detail: input.detail ?? null
  });

  const [row] = await db("customer_memory_units")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      case_id: input.caseId ?? null,
      scope_type: input.caseId ? "case" : "conversation",
      memory_type: input.memoryType,
      abstraction: "semantic",
      title: input.title ?? null,
      summary: input.summary,
      detail: input.detail ?? null,
      payload: JSON.stringify(input.payload ?? {}),
      source: input.source,
      salience: input.salience,
      confidence: input.confidence,
      fingerprint: input.fingerprint,
      embedding_input: embeddingText,
      index_status: "pending",
      index_last_error: null,
      next_retry_at: null
    })
    .onConflict(["tenant_id", "fingerprint"])
    .merge({
      summary: input.summary,
      detail: input.detail ?? null,
      payload: JSON.stringify(input.payload ?? {}),
      salience: input.salience,
      confidence: input.confidence,
      embedding_input: embeddingText,
      index_status: "pending",
      index_last_error: null,
      next_retry_at: null,
      updated_at: db.fn.now()
    })
    .returning(["memory_unit_id"]);

  void scheduleMemoryUnitVectorSync({
    tenantId: input.tenantId,
    customerId: input.customerId,
    memoryUnitId: String(row.memory_unit_id)
  }).catch(() => null);
}

export async function upsertConversationInsight(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    data: ConversationInsight;
    source?: string;
  }
): Promise<void> {
  const conversation = await db("conversations")
    .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
    .select("current_case_id")
    .first<{ current_case_id: string | null } | undefined>();

  const caseId = conversation?.current_case_id ?? null;

  await db("conversation_memory_snapshots")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      case_id: caseId,
      summary: input.data.summary,
      intent: input.data.lastIntent,
      sentiment: input.data.lastSentiment,
      message_count: input.data.messageCount,
      key_entities: JSON.stringify(input.data.keyEntities),
      last_customer_goal: input.data.summary.slice(0, 240),
      last_resolution: null
    })
    .onConflict(["tenant_id", "conversation_id"])
    .merge({
      customer_id: input.customerId,
      case_id: caseId,
      summary: input.data.summary,
      intent: input.data.lastIntent,
      sentiment: input.data.lastSentiment,
      message_count: input.data.messageCount,
      key_entities: JSON.stringify(input.data.keyEntities),
      last_customer_goal: input.data.summary.slice(0, 240),
      updated_at: db.fn.now()
    });

  await upsertDerivedMemoryUnit(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId,
    caseId,
    memoryType: "episodic_summary",
    title: "Conversation episode",
    summary: input.data.summary,
    detail: `intent=${input.data.lastIntent} | sentiment=${input.data.lastSentiment} | messages=${input.data.messageCount}`,
    payload: {
      lastIntent: input.data.lastIntent,
      lastSentiment: input.data.lastSentiment,
      keyEntities: input.data.keyEntities,
      messageCount: input.data.messageCount
    },
    source: input.source ?? "conversation_memory_snapshot",
    salience: 72,
    confidence: 0.84,
    fingerprint: buildFingerprint(["episodic_summary", input.conversationId, caseId ?? "no-case"])
  });

  await rebuildCustomerProfile(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    dirtyReason: "conversation_snapshot_updated"
  });

  if (caseId) {
    await db("conversation_cases")
      .where({ tenant_id: input.tenantId, case_id: caseId })
      .update({
        summary: input.data.summary,
        last_activity_at: db.fn.now(),
        updated_at: db.fn.now()
      });
  }
}

export async function recordCustomerMemoryItem(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    conversationId?: string | null;
    caseId?: string | null;
    taskId?: string | null;
    memoryType: string;
    source: string;
    title?: string | null;
    summary: string;
    content?: Record<string, unknown>;
    confidence?: number;
    salience?: number;
    expiresAt?: Date | null;
  }
) {
  const result = await recordCustomerMemoryItems(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId ?? null,
    caseId: input.caseId ?? null,
    taskId: input.taskId ?? null,
    source: input.source,
    items: [
      {
        memoryType: input.memoryType,
        title: input.title ?? null,
        summary: input.summary,
        detail: typeof input.content?.detail === "string" ? input.content.detail : null,
        content: input.content,
        confidence: input.confidence,
        salience: input.salience,
        expiresAt: input.expiresAt ?? null
      }
    ]
  });

  return { memoryId: result.memoryIds[0] ?? null };
}

export async function recordCustomerMemoryItems(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    conversationId?: string | null;
    caseId?: string | null;
    taskId?: string | null;
    source: string;
    items: Array<{
      memoryType: string;
      title?: string | null;
      summary: string;
      detail?: string | null;
      content?: Record<string, unknown>;
      confidence?: number;
      salience?: number;
      expiresAt?: Date | null;
    }>;
  }
) {
  if (input.items.length === 0) {
    return { memoryIds: [] as string[] };
  }

  const rows = input.items.map((item) => {
    const detail = typeof item.detail === "string"
      ? item.detail
      : typeof item.content?.detail === "string"
        ? item.content.detail
        : null;
    const embeddingText = buildMemoryEmbeddingText({
      memoryType: item.memoryType,
      title: item.title ?? null,
      summary: item.summary,
      detail
    });
    const fingerprint = buildFingerprint([
      item.memoryType,
      input.customerId,
      input.caseId ?? null,
      input.taskId ?? null,
      normalizeText(item.summary).toLowerCase()
    ]);

    return {
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      conversation_id: input.conversationId ?? null,
      case_id: input.caseId ?? null,
      task_id: input.taskId ?? null,
      scope_type: input.taskId ? "task" : input.caseId ? "case" : input.conversationId ? "conversation" : "customer",
      memory_type: item.memoryType,
      abstraction: "semantic",
      title: item.title ?? null,
      summary: item.summary,
      detail,
      payload: JSON.stringify(item.content ?? {}),
      source: input.source,
      confidence: item.confidence ?? 0.75,
      salience: item.salience ?? 60,
      status: "active",
      expires_at: item.expiresAt ?? null,
      fingerprint,
      embedding_input: embeddingText,
      index_status: "pending",
      index_last_error: null,
      next_retry_at: null
    };
  });

  const inserted = await db("customer_memory_units")
    .insert(rows)
    .onConflict(["tenant_id", "fingerprint"])
    .merge({
      title: db.raw("EXCLUDED.title"),
      summary: db.raw("EXCLUDED.summary"),
      detail: db.raw("EXCLUDED.detail"),
      payload: db.raw("EXCLUDED.payload"),
      confidence: db.raw("EXCLUDED.confidence"),
      salience: db.raw("EXCLUDED.salience"),
      status: "active",
      expires_at: db.raw("EXCLUDED.expires_at"),
      embedding_input: db.raw("EXCLUDED.embedding_input"),
      index_status: "pending",
      index_last_error: null,
      next_retry_at: null,
      updated_at: db.fn.now()
    })
    .returning(["memory_unit_id"]);

  const memoryIds = inserted.map((row) => String(row.memory_unit_id));
  for (const memoryUnitId of memoryIds) {
    void scheduleMemoryUnitVectorSync({
      tenantId: input.tenantId,
      customerId: input.customerId,
      memoryUnitId
    }).catch(() => null);
  }

  await rebuildCustomerProfile(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    dirtyReason: `memory_unit:${input.source}`
  });

  return { memoryIds };
}

export async function upsertCustomerStateSnapshot(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    stateType: string;
    statePayload: Record<string, unknown>;
    status?: string;
    expiresAt?: Date | null;
  }
) {
  const summary = normalizeText(JSON.stringify(input.statePayload).slice(0, 240));

  await db("customer_memory_states")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      state_type: input.stateType,
      summary,
      state_payload: JSON.stringify(input.statePayload),
      confidence: 0.86,
      status: input.status ?? "active",
      expires_at: input.expiresAt ?? null,
      freshness_at: db.fn.now()
    })
    .onConflict(["tenant_id", "customer_id", "state_type"])
    .merge({
      summary,
      state_payload: JSON.stringify(input.statePayload),
      confidence: 0.86,
      status: input.status ?? "active",
      expires_at: input.expiresAt ?? null,
      freshness_at: db.fn.now(),
      updated_at: db.fn.now()
    });

  await recordCustomerMemoryItem(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    memoryType: `state:${input.stateType}`,
    source: "customer_memory_state",
    title: `State ${input.stateType}`,
    summary,
    content: input.statePayload,
    confidence: 0.86,
    salience: 88,
    expiresAt: input.expiresAt ?? null
  });

  await rebuildCustomerProfile(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    dirtyReason: `state_snapshot:${input.stateType}`
  });
}

async function searchRelevantMemoryUnits(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    query: string;
    limit: number;
  }
) {
  const normalized = normalizeText(input.query);
  if (!normalized) {
    return {
      selected: [] as RetrievedMemoryUnit[],
      lexicalHits: [] as Array<{ id: string; score: number }>,
      vectorHits: [] as Array<{ id: string; score: number }>
    };
  }

  const lexicalRows = await db("customer_memory_units")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
    .where((builder) => {
      builder.whereNull("expires_at").orWhere("expires_at", ">", db.fn.now());
    })
    .whereRaw("search_vector @@ plainto_tsquery('simple', ?)", [normalized])
    .select(
      "memory_unit_id",
      "memory_type",
      "title",
      "summary",
      "detail",
      "salience",
      "confidence",
      "updated_at",
      db.raw("ts_rank_cd(search_vector, plainto_tsquery('simple', ?)) as lexical_score", [normalized])
    )
    .orderByRaw("ts_rank_cd(search_vector, plainto_tsquery('simple', ?)) DESC", [normalized])
    .limit(Math.max(input.limit * 2, 8)) as Array<MemoryUnitRow & { lexical_score?: string | number | null }>;

  const vectorRows = lexicalRows.length >= Math.min(input.limit, 4)
    ? []
    : await searchRelevantMemoryVectors({
        tenantId: input.tenantId,
        customerId: input.customerId,
        query: normalized,
        limit: input.limit * 2
      });

  const lexicalHits = lexicalRows.map((row) => ({
    id: row.memory_unit_id,
    score: toNumber((row as { lexical_score?: string | number | null }).lexical_score, 0)
  }));
  const vectorScores = new Map(vectorRows.map((row) => [row.id, row.score]));
  const lexicalIds = new Set(lexicalRows.map((row) => row.memory_unit_id));
  const missingVectorIds = vectorRows
    .map((row) => row.id)
    .filter((id) => !lexicalIds.has(id));

  const vectorOnlyRows = missingVectorIds.length === 0
    ? []
    : await db("customer_memory_units")
        .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
        .whereIn("memory_unit_id", missingVectorIds)
        .where((builder) => {
          builder.whereNull("expires_at").orWhere("expires_at", ">", db.fn.now());
        })
        .select("memory_unit_id", "memory_type", "title", "summary", "detail", "salience", "confidence", "updated_at") as MemoryUnitRow[];

  const scored = [...lexicalRows, ...vectorOnlyRows]
    .map((row) => {
      const lexical = toNumber((row as { lexical_score?: string | number | null }).lexical_score, 0);
      const vector = vectorScores.get(row.memory_unit_id) ?? 0;
      const salience = Math.min(1, Math.max(0, Number(row.salience ?? 0) / 100));
      const freshness = row.updated_at
        ? Math.max(0, 1 - ((Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24 * 30)))
        : 0;
      return {
        row: {
          ...row,
          lexical_score: lexical,
          vector_score: vector,
          blended_score: lexical * 0.42 + vector * 0.42 + salience * 0.1 + freshness * 0.06
        } satisfies RetrievedMemoryUnit,
        score: lexical * 0.42 + vector * 0.42 + salience * 0.1 + freshness * 0.06
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);

  const ids = scored.map((item) => item.row.memory_unit_id);
  if (ids.length > 0) {
    void db("customer_memory_units")
      .where({ tenant_id: input.tenantId })
      .whereIn("memory_unit_id", ids)
      .update({ last_used_at: db.fn.now(), updated_at: db.fn.now() })
      .catch(() => null);
  }

  return {
    selected: scored.map((item) => item.row),
    lexicalHits,
    vectorHits: vectorRows
  };
}

async function recordMemoryRecallTrace(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    queryText: string;
    lexicalHits: Array<{ id: string; score: number }>;
    vectorHits: Array<{ id: string; score: number }>;
    selected: RetrievedMemoryUnit[];
  }
) {
  if (!input.queryText.trim()) return;
  await db("memory_recall_traces").insert({
    tenant_id: input.tenantId,
    customer_id: input.customerId,
    conversation_id: input.conversationId,
    query_text: input.queryText.slice(0, 4000),
    retrieval_scope: "customer_memory_context",
    lexical_hits: JSON.stringify(input.lexicalHits.slice(0, 16)),
    vector_hits: JSON.stringify(input.vectorHits.slice(0, 16)),
    selected_hits: JSON.stringify(
      input.selected.map((row) => ({
        id: row.memory_unit_id,
        memoryType: row.memory_type,
        lexicalScore: row.lexical_score ?? 0,
        vectorScore: row.vector_score ?? 0,
        blendedScore: row.blended_score ?? 0
      }))
    ),
    metadata: JSON.stringify({
      selectedCount: input.selected.length
    })
  }).catch(() => null);
}

export async function buildCustomerIntelligenceContext(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string,
  customerId?: string,
  options?: {
    excludeMemoryTypes?: string[];
  }
): Promise<string> {
  const parts: string[] = [];

  const wmTurns = await getWorkingMemory(conversationId);
  if (wmTurns.length > 0) {
    const recent = wmTurns.slice(-WM_CONTEXT_TURNS);
    parts.push(
      `[WORKING MEMORY]\n${recent
        .map((turn) => `  ${turn.role === "user" ? "Customer" : "AI"}: ${turn.content.slice(0, 220)}`)
        .join("\n")}`
    );
  }

  const snapshot = await getConversationInsightRecord(db, tenantId, conversationId);
  if (snapshot) {
    parts.push(
      `[CURRENT CONVERSATION SNAPSHOT]\n` +
      `Summary: ${snapshot.summary.slice(0, 600)}\n` +
      `Intent: ${snapshot.lastIntent}\n` +
      `Sentiment: ${snapshot.lastSentiment}\n` +
      `Entities: ${JSON.stringify(snapshot.keyEntities).slice(0, 240)}`
    );
  }

  if (!customerId) {
    return parts.join("\n\n");
  }

  const [profile, states, latestMessages] = await Promise.all([
    getCustomerProfileRecord(db, tenantId, customerId),
    db("customer_memory_states")
      .where({ tenant_id: tenantId, customer_id: customerId, status: "active" })
      .select("state_type", "summary", "state_payload", "updated_at")
      .orderBy("updated_at", "desc")
      .limit(5),
    db("messages")
      .where({ tenant_id: tenantId, conversation_id: conversationId })
      .select("direction", "content")
      .orderBy("created_at", "desc")
      .limit(6)
  ]);

  const queryText = [
    snapshot?.summary ?? "",
    ...latestMessages.map((row) => {
      const content = parseObject(row.content);
      return typeof content.text === "string" ? content.text : "";
    })
  ]
    .filter(Boolean)
    .join(" ");

  const memoryRetrieval = await searchRelevantMemoryUnits(db, {
    tenantId,
    customerId,
    query: queryText,
    limit: 6
  });
  const excludedTypes = new Set((options?.excludeMemoryTypes ?? []).map((item) => String(item)));
  const relevantMemories = memoryRetrieval.selected.filter((row) => !excludedTypes.has(String(row.memory_type)));

  if (profile?.profileSummary) {
    parts.push(`[CUSTOMER PROFILE]\n${profile.profileSummary.slice(0, 1800)}`);
  }

  if (states.length > 0) {
    parts.push(
      `[ACTIVE STATES]\n${states
        .map((row) => `  ${String(row.state_type)} | ${String(row.summary ?? "").slice(0, 220)}`)
        .join("\n")}`
    );
  }

  if (relevantMemories.length > 0) {
    parts.push(
      `[RELEVANT CUSTOMER MEMORY]\n${relevantMemories
        .map((row) => {
          const title = typeof row.title === "string" && row.title.trim() ? `${row.title.trim()} | ` : "";
          const detail = typeof row.detail === "string" && row.detail.trim() ? ` | ${row.detail.slice(0, 140)}` : "";
          return `  [${row.memory_type}] ${title}${String(row.summary ?? "").slice(0, 220)}${detail}`;
        })
        .join("\n")}`
    );
  }

  void recordMemoryRecallTrace(db, {
    tenantId,
    customerId,
    conversationId,
    queryText,
    lexicalHits: memoryRetrieval.lexicalHits,
    vectorHits: memoryRetrieval.vectorHits,
    selected: relevantMemories
  });

  return parts.join("\n\n");
}
