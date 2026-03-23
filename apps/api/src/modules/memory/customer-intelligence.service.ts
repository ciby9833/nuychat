import type { Knex } from "knex";

import { redisConnection } from "../../infra/redis/client.js";

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
  return [];
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
    .slice(0, 48)
    .join(" ");
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
  const row = await db("conversation_intelligence")
    .where({ tenant_id: tenantId, conversation_id: conversationId })
    .first();

  if (!row) return null;

  const keyEntities = parseObject(row.key_entities);
  return {
    summary: String(row.summary ?? ""),
    lastIntent: String(row.last_intent ?? "general_inquiry"),
    lastSentiment: String(row.last_sentiment ?? "neutral"),
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
  const row = await db("customer_profiles")
    .where({ tenant_id: tenantId, customer_id: customerId })
    .first();

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
  const [customer, insights, memories, states] = await Promise.all([
    db("customers")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .select("display_name", "tier", "language", "tags", "metadata")
      .first<Record<string, unknown> | undefined>(),
    db("conversation_intelligence")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId })
      .select("summary", "last_intent", "last_sentiment", "updated_at")
      .orderBy("updated_at", "desc")
      .limit(8),
    db("customer_memory_items")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
      .where((builder) => {
        builder.whereNull("expires_at").orWhere("expires_at", ">", db.fn.now());
      })
      .select("memory_type", "summary", "content", "salience", "updated_at")
      .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
      .limit(12),
    db("customer_state_snapshots")
      .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
      .select("state_type", "state_payload", "updated_at")
      .orderBy("updated_at", "desc")
  ]);

  const baseFacts = [
    customer?.display_name ? `customer=${String(customer.display_name)}` : null,
    customer?.tier ? `tier=${String(customer.tier)}` : null,
    customer?.language ? `language=${String(customer.language)}` : null
  ].filter(Boolean);

  const recentInsightLines = insights
    .map((row) => {
      const parts = [
        `[${new Date(String(row.updated_at)).toISOString()}]`,
        row.last_intent ? `intent=${String(row.last_intent)}` : null,
        row.last_sentiment ? `sentiment=${String(row.last_sentiment)}` : null,
        row.summary ? String(row.summary).slice(0, 220) : null
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .filter(Boolean);

  const memoryLines = memories.map((row) => {
    const content = parseObject(row.content);
    const detail = typeof content.detail === "string" ? content.detail : "";
    return [
      `[${String(row.memory_type)}]`,
      String(row.summary ?? "").slice(0, 180),
      detail ? `detail=${detail.slice(0, 120)}` : null
    ].filter(Boolean).join(" | ");
  });

  const stateSnapshot = Object.fromEntries(
    states.map((row) => [String(row.state_type), parseObject(row.state_payload)])
  );

  const soulProfile = {
    tier: customer?.tier ?? "standard",
    language: customer?.language ?? "id",
    tags: Array.isArray(customer?.tags) ? customer?.tags : [],
    traits: memories
      .filter((row) => String(row.memory_type).startsWith("soul_"))
      .map((row) => String(row.summary ?? ""))
      .filter(Boolean)
      .slice(0, 8)
  };

  const operatingNotes = {
    lastUpdatedAt: new Date().toISOString(),
    latestStateTypes: Object.keys(stateSnapshot),
    memoryHighlights: memoryLines.slice(0, 6)
  };

  const profileSummary = [
    baseFacts.join(" | "),
    recentInsightLines.length > 0 ? `[RECENT HISTORY]\n${recentInsightLines.join("\n")}` : null,
    memoryLines.length > 0 ? `[MEMORY]\n${memoryLines.join("\n")}` : null
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  const profileKeywords = normalizeKeywords(`${profileSummary} ${memoryLines.join(" ")}`);
  const latestInsight = insights[0];

  await db("customer_profiles")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      soul_profile: JSON.stringify(soulProfile),
      operating_notes: JSON.stringify(operatingNotes),
      state_snapshot: JSON.stringify(stateSnapshot),
      profile_summary: profileSummary,
      profile_keywords: profileKeywords,
      last_intent: latestInsight?.last_intent ?? "general_inquiry",
      last_sentiment: latestInsight?.last_sentiment ?? "neutral",
      memory_item_count: memories.length,
      conversation_count: insights.length,
      source_version: 1,
      indexed_version: 0,
      dirty: true,
      dirty_reason: input.dirtyReason,
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
      last_intent: latestInsight?.last_intent ?? "general_inquiry",
      last_sentiment: latestInsight?.last_sentiment ?? "neutral",
      memory_item_count: memories.length,
      conversation_count: insights.length,
      dirty: true,
      dirty_reason: input.dirtyReason,
      source_version: db.raw("customer_profiles.source_version + 1"),
      source_updated_at: db.fn.now(),
      claimed_at: null,
      claimed_by: null,
      updated_at: db.fn.now()
    });
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

  await db("conversation_intelligence")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      case_id: caseId,
      summary: input.data.summary,
      last_intent: input.data.lastIntent,
      last_sentiment: input.data.lastSentiment,
      message_count: input.data.messageCount,
      key_entities: JSON.stringify(input.data.keyEntities)
    })
    .onConflict(["tenant_id", "conversation_id"])
    .merge({
      customer_id: input.customerId,
      case_id: caseId,
      summary: input.data.summary,
      last_intent: input.data.lastIntent,
      last_sentiment: input.data.lastSentiment,
      message_count: input.data.messageCount,
      key_entities: JSON.stringify(input.data.keyEntities),
      updated_at: db.fn.now()
    });

  const existingMemory = await db("customer_memory_items")
    .where({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      case_id: caseId,
      memory_type: "conversation_summary",
      source: input.source ?? "conversation_intelligence",
      status: "active"
    })
    .select("memory_id")
    .orderBy("updated_at", "desc")
    .first<{ memory_id: string } | undefined>();

  const memoryPayload = {
    lastIntent: input.data.lastIntent,
    lastSentiment: input.data.lastSentiment,
    keyEntities: input.data.keyEntities,
    messageCount: input.data.messageCount
  };

  if (existingMemory) {
    await db("customer_memory_items")
      .where({ tenant_id: input.tenantId, memory_id: existingMemory.memory_id })
      .update({
        title: "Conversation summary",
        summary: input.data.summary,
        content: JSON.stringify(memoryPayload),
        confidence: 0.82,
        salience: 75,
        case_id: caseId,
        updated_at: db.fn.now()
      });
  } else {
    await db("customer_memory_items").insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      case_id: caseId,
      memory_type: "conversation_summary",
      source: input.source ?? "conversation_intelligence",
      title: "Conversation summary",
      summary: input.data.summary,
      content: JSON.stringify(memoryPayload),
      confidence: 0.82,
      salience: 75,
      status: "active"
    });
  }

  if (caseId) {
    await db("conversation_cases")
      .where({ tenant_id: input.tenantId, case_id: caseId })
      .update({
        summary: input.data.summary,
        last_activity_at: db.fn.now(),
        updated_at: db.fn.now()
      });
  }

  await rebuildCustomerProfile(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    dirtyReason: "conversation_intelligence_updated"
  });
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
  const [row] = await db("customer_memory_items")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      conversation_id: input.conversationId ?? null,
      case_id: input.caseId ?? null,
      task_id: input.taskId ?? null,
      memory_type: input.memoryType,
      source: input.source,
      title: input.title ?? null,
      summary: input.summary,
      content: JSON.stringify(input.content ?? {}),
      confidence: input.confidence ?? 0.75,
      salience: input.salience ?? 60,
      status: "active",
      expires_at: input.expiresAt ?? null
    })
    .returning(["memory_id"]);

  await rebuildCustomerProfile(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    dirtyReason: `memory_item:${input.memoryType}`
  });

  return { memoryId: row.memory_id as string };
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
  await db("customer_state_snapshots")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      state_type: input.stateType,
      state_payload: JSON.stringify(input.statePayload),
      status: input.status ?? "active",
      expires_at: input.expiresAt ?? null
    })
    .onConflict(["tenant_id", "customer_id", "state_type"])
    .merge({
      state_payload: JSON.stringify(input.statePayload),
      status: input.status ?? "active",
      expires_at: input.expiresAt ?? null,
      effective_at: db.fn.now(),
      updated_at: db.fn.now()
    });

  await rebuildCustomerProfile(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    dirtyReason: `state_snapshot:${input.stateType}`
  });
}

export async function buildCustomerIntelligenceContext(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string,
  customerId?: string
): Promise<string> {
  const parts: string[] = [];

  const wmTurns = await getWorkingMemory(conversationId);
  if (wmTurns.length > 0) {
    const recent = wmTurns.slice(-WM_CONTEXT_TURNS);
    parts.push(
      `[RECENT CONVERSATION]\n${recent
        .map((turn) => `  ${turn.role === "user" ? "Customer" : "AI"}: ${turn.content.slice(0, 200)}`)
        .join("\n")}`
    );
  }

  const insight = await getConversationInsightRecord(db, tenantId, conversationId);
  if (insight) {
    parts.push(
      `[CONVERSATION INTELLIGENCE]\n` +
      `Summary: ${insight.summary}\n` +
      `Last intent: ${insight.lastIntent}\n` +
      `Sentiment: ${insight.lastSentiment}`
    );
  }

  if (customerId) {
    const [profile, memoryItems, states] = await Promise.all([
      getCustomerProfileRecord(db, tenantId, customerId),
      db("customer_memory_items")
        .where({ tenant_id: tenantId, customer_id: customerId, status: "active" })
        .where((builder) => {
          builder.whereNull("expires_at").orWhere("expires_at", ">", db.fn.now());
        })
        .select("memory_type", "title", "summary", "content", "salience")
        .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
        .limit(6),
      db("customer_state_snapshots")
        .where({ tenant_id: tenantId, customer_id: customerId, status: "active" })
        .select("state_type", "state_payload")
        .orderBy("updated_at", "desc")
        .limit(4)
    ]);

    if (profile?.profileSummary) {
      parts.push(`[CUSTOMER PROFILE]\n${profile.profileSummary.slice(0, 1800)}`);
    }

    if (states.length > 0) {
      const stateLines = states.map((row) => `  ${String(row.state_type)}: ${JSON.stringify(parseObject(row.state_payload)).slice(0, 240)}`);
      parts.push(`[CUSTOMER STATE]\n${stateLines.join("\n")}`);
    }

    if (memoryItems.length > 0) {
      const memoryLines = memoryItems.map((row) => {
        const title = typeof row.title === "string" && row.title.trim() ? `${row.title.trim()} | ` : "";
        return `  [${String(row.memory_type)}] ${title}${String(row.summary ?? "").slice(0, 220)}`;
      });
      parts.push(`[LONG-TERM MEMORY]\n${memoryLines.join("\n")}`);
    }
  }

  const taskQuery = db("async_tasks")
    .where({ tenant_id: tenantId })
    .whereIn("status", ["succeeded", "published"])
    .whereNotNull("result_summary")
    .orderBy("created_at", "desc")
    .limit(4)
    .select("title", "task_type", "result_summary", "conversation_id", "created_at");

  if (customerId) {
    taskQuery.andWhere((builder) => {
      builder.where("customer_id", customerId).orWhere("conversation_id", conversationId);
    });
  } else {
    taskQuery.andWhere("conversation_id", conversationId);
  }

  const taskRows = await taskQuery;
  if (taskRows.length > 0) {
    const lines = taskRows.map((row) => {
      const scope = String(row.conversation_id) === conversationId ? "same_conversation" : "customer_history";
      return `  [${scope}] ${new Date(String(row.created_at)).toISOString()} | ${String(row.title)} | ${String(row.task_type)} | ${String(row.result_summary).slice(0, 220)}`;
    });
    parts.push(`[TASK HISTORY]\n${lines.join("\n")}`);
  }

  return parts.join("\n\n");
}
