import type { Knex } from "knex";
import type { AIProvider } from "../../../../../packages/ai-sdk/src/index.ts";

import { resolveTenantAISettings } from "../ai/provider-config.service.js";
import { recordAIUsage } from "../ai/usage-meter.service.js";
import { recordCustomerMemoryItems } from "./customer-intelligence.service.js";

type EncodedMemoryType =
  | "fact"
  | "preference"
  | "unresolved_issue"
  | "commitment"
  | "outcome"
  | "risk_flag"
  | "profile_trait";

type EventFacet = {
  text: string;
  evidence?: string;
};

type EventFrame = {
  customerGoals: EventFacet[];
  stableFacts: EventFacet[];
  preferences: EventFacet[];
  unresolvedIssues: EventFacet[];
  commitments: EventFacet[];
  outcomes: EventFacet[];
  riskSignals: EventFacet[];
  profileTraits: EventFacet[];
  resolutionStatus: "resolved" | "partially_resolved" | "unresolved" | "unknown";
};

type EncodedMemoryItem = {
  type: EncodedMemoryType;
  title: string;
  summary: string;
  detail?: string;
  evidence?: string;
  confidence?: number;
  salience?: number;
  expiresInDays?: number | null;
};

type ReviewDecision = {
  keep: boolean;
  title: string;
  summary: string;
  detail?: string;
  confidence?: number;
  salience?: number;
  expiresInDays?: number | null;
  reason?: string;
};

type ReviewedMemoryItem = EncodedMemoryItem & {
  keep: boolean;
  reason?: string;
};

type ConversationEncodingInput = {
  tenantId: string;
  customerId: string;
  conversationId: string;
  caseId?: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  conversationSummary: string;
  lastIntent: string;
  lastSentiment: string;
  finalResponse?: string | null;
};

type TaskEncodingInput = {
  tenantId: string;
  customerId: string;
  conversationId?: string | null;
  caseId?: string | null;
  taskId: string;
  taskType: string;
  title: string;
  resultSummary: string;
  payload: Record<string, unknown>;
};

type ExistingMemoryHint = {
  memoryType: string;
  title: string;
  summary: string;
  updatedAt: string;
};

type MemoryEncodingPreview = {
  eventFrame: EventFrame;
  candidateItems: EncodedMemoryItem[];
  reviewedItems: ReviewedMemoryItem[];
  finalItems: ReviewedMemoryItem[];
  metrics: {
    existingMemoryCount: number;
    candidateCount: number;
    reviewedCount: number;
    finalCount: number;
    resolutionStatus: EventFrame["resolutionStatus"];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  };
  skipped: false;
};

type MemoryEncodingSkipped = {
  skipped: true;
  reason: "no_ai_provider" | "empty_event_frame" | "empty_candidate_items" | "all_candidates_rejected";
  eventFrame?: EventFrame;
  candidateItems?: EncodedMemoryItem[];
  reviewedItems?: ReviewedMemoryItem[];
};

const EVENT_FRAME_SYSTEM = `You are a customer-memory event framer.
Transform the interaction into a structured event representation for downstream memory encoding.
Return valid JSON only.

Focus:
- Stable customer facts
- Stable preferences
- Pending problems
- Promises/commitments
- Resolved outcomes
- Risk or escalation signals
- Durable behavioral traits

Ignore:
- Small talk
- Repeated paraphrases
- One-off wording that is not reusable later

Return:
{
  "customerGoals": [{"text":"", "evidence":""}],
  "stableFacts": [{"text":"", "evidence":""}],
  "preferences": [{"text":"", "evidence":""}],
  "unresolvedIssues": [{"text":"", "evidence":""}],
  "commitments": [{"text":"", "evidence":""}],
  "outcomes": [{"text":"", "evidence":""}],
  "riskSignals": [{"text":"", "evidence":""}],
  "profileTraits": [{"text":"", "evidence":""}],
  "resolutionStatus": "resolved"
}`;

const MEMORY_CANDIDATE_SYSTEM = `You are a high-quality customer-memory encoder.
Convert an event frame into durable retrieval memories.
Return valid JSON only.

Rules:
- Use only: fact, preference, unresolved_issue, commitment, outcome, risk_flag, profile_trait.
- Each item must be reusable in future customer service interactions.
- Write canonical, compact memory summaries.
- Prefer one atomic memory per item.
- Do not create near-duplicates.
- Do not store transient chatter or vague emotional wording.
- If evidence is weak, lower confidence.
- Use shorter expiry for operational outcomes and commitments when appropriate.

Return:
{
  "items": [
    {
      "type": "fact",
      "title": "short title",
      "summary": "canonical reusable memory",
      "detail": "optional detail",
      "evidence": "optional evidence",
      "confidence": 0.0,
      "salience": 0,
      "expiresInDays": 30
    }
  ]
}`;

const MEMORY_REVIEW_SYSTEM = `You are a strict memory-quality reviewer for a customer support memory system.
Review candidate memory items against quality rules and existing memories.
Return valid JSON only.

Quality rules:
- Keep only durable, retrieval-worthy memory.
- Remove duplicates or near-duplicates of existing memories.
- Remove information that is too temporary, too vague, or obvious from the immediate conversation alone.
- Rewrite kept memories into canonical form.
- Prefer high precision over high recall.
- Keep atomic memories; split conflated ideas by dropping the weaker part if needed.
- unresolved_issue, commitment, and risk_flag can be higher salience.
- If an item should be dropped, set keep=false and explain briefly.

Return:
{
  "items": [
    {
      "keep": true,
      "title": "short title",
      "summary": "canonical reusable memory",
      "detail": "optional detail",
      "confidence": 0.0,
      "salience": 0,
      "expiresInDays": 30,
      "reason": "optional reviewer note"
    }
  ]
}`;

function clampConfidence(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0.1, Math.min(0.99, num));
}

function clampSalience(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(10, Math.min(100, Math.round(num)));
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeFacetArray(value: unknown): EventFacet[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const text = typeof row.text === "string" ? normalizeText(row.text) : "";
      if (!text) return null;
      const evidence = typeof row.evidence === "string" ? normalizeText(row.evidence) : undefined;
      return { text, evidence } satisfies EventFacet;
    })
    .filter((item): item is EventFacet => Boolean(item))
    .slice(0, 8);
}

function parseEventFrame(raw: string): EventFrame {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const resolutionStatus = typeof parsed.resolutionStatus === "string"
      && ["resolved", "partially_resolved", "unresolved", "unknown"].includes(parsed.resolutionStatus)
      ? parsed.resolutionStatus as EventFrame["resolutionStatus"]
      : "unknown";
    return {
      customerGoals: normalizeFacetArray(parsed.customerGoals),
      stableFacts: normalizeFacetArray(parsed.stableFacts),
      preferences: normalizeFacetArray(parsed.preferences),
      unresolvedIssues: normalizeFacetArray(parsed.unresolvedIssues),
      commitments: normalizeFacetArray(parsed.commitments),
      outcomes: normalizeFacetArray(parsed.outcomes),
      riskSignals: normalizeFacetArray(parsed.riskSignals),
      profileTraits: normalizeFacetArray(parsed.profileTraits),
      resolutionStatus
    };
  } catch {
    return {
      customerGoals: [],
      stableFacts: [],
      preferences: [],
      unresolvedIssues: [],
      commitments: [],
      outcomes: [],
      riskSignals: [],
      profileTraits: [],
      resolutionStatus: "unknown"
    };
  }
}

function parseCandidateItems(raw: string): EncodedMemoryItem[] {
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((item) => parseBaseMemoryItem(item))
      .filter((item): item is EncodedMemoryItem => Boolean(item));
  } catch {
    return [];
  }
}

function parseReviewedItems(raw: string, fallback: EncodedMemoryItem[]): ReviewedMemoryItem[] {
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) {
      return fallback.map((item) => ({ ...item, keep: true }));
    }
    return parsed.items
      .map((item, index) => {
        const base = parseBaseMemoryItem(item) ?? fallback[index] ?? null;
        if (!base) return null;
        const row = item && typeof item === "object" && !Array.isArray(item)
          ? item as Record<string, unknown>
          : {};
        const keep = row.keep === false ? false : true;
        const reason = typeof row.reason === "string" ? normalizeText(row.reason) : undefined;
        return { ...base, keep, reason } satisfies ReviewedMemoryItem;
      })
      .filter((item): item is ReviewedMemoryItem => Boolean(item));
  } catch {
    return fallback.map((item) => ({ ...item, keep: true }));
  }
}

function parseBaseMemoryItem(item: unknown): EncodedMemoryItem | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type.trim() as EncodedMemoryType : null;
  const title = typeof row.title === "string" ? normalizeText(row.title) : "";
  const summary = typeof row.summary === "string" ? normalizeText(row.summary) : "";
  const detail = typeof row.detail === "string" ? normalizeText(row.detail) : undefined;
  const evidence = typeof row.evidence === "string" ? normalizeText(row.evidence) : undefined;
  if (!type || !title || !summary) return null;
  if (!["fact", "preference", "unresolved_issue", "commitment", "outcome", "risk_flag", "profile_trait"].includes(type)) {
    return null;
  }
  return {
    type,
    title,
    summary,
    detail,
    evidence,
    confidence: clampConfidence(row.confidence, 0.76),
    salience: clampSalience(row.salience, defaultSalience(type)),
    expiresInDays: row.expiresInDays === null || row.expiresInDays === undefined
      ? null
      : Math.max(1, Math.min(365, Number(row.expiresInDays)))
  } satisfies EncodedMemoryItem;
}

function defaultSalience(type: EncodedMemoryType) {
  if (type === "risk_flag") return 95;
  if (type === "unresolved_issue") return 90;
  if (type === "commitment") return 88;
  if (type === "preference") return 84;
  if (type === "profile_trait") return 80;
  if (type === "outcome") return 74;
  return 72;
}

function expiresAtFromDays(days: number | null | undefined) {
  if (!days || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function eventFrameLooksUseful(frame: EventFrame) {
  return (
    frame.stableFacts.length > 0
    || frame.preferences.length > 0
    || frame.unresolvedIssues.length > 0
    || frame.commitments.length > 0
    || frame.outcomes.length > 0
    || frame.riskSignals.length > 0
    || frame.profileTraits.length > 0
  );
}

function dedupeReviewedItems(items: ReviewedMemoryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.keep) return false;
    const key = `${item.type}|${item.summary.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function serializeFinalItems(items: ReviewedMemoryItem[]) {
  return items.map((item) => ({
    type: item.type,
    title: item.title,
    summary: item.summary,
    detail: item.detail ?? null,
    evidence: item.evidence ?? null,
    confidence: item.confidence ?? null,
    salience: item.salience ?? null,
    expiresInDays: item.expiresInDays ?? null
  }));
}

async function loadExistingMemoryHints(
  db: Knex,
  input: { tenantId: string; customerId: string; limit?: number }
): Promise<ExistingMemoryHint[]> {
  const rows = await db("customer_memory_units")
    .where({ tenant_id: input.tenantId, customer_id: input.customerId, status: "active" })
    .where((builder) => {
      builder.whereNull("expires_at").orWhere("expires_at", ">", db.fn.now());
    })
    .select("memory_type", "title", "summary", "updated_at")
    .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
    .limit(Math.max(4, Math.min(input.limit ?? 12, 20)));

  return rows.map((row) => ({
    memoryType: String(row.memory_type),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }));
}

async function recordMemoryEncoderTrace(
  db: Knex,
  input: {
    tenantId: string;
    customerId: string;
    sourceKind: "conversation" | "task";
    inputContext: Record<string, unknown>;
    preview: MemoryEncodingPreview | MemoryEncodingSkipped;
    conversationId?: string | null;
    caseId?: string | null;
    taskId?: string | null;
  }
) {
  await db("memory_encoder_traces").insert({
    tenant_id: input.tenantId,
    customer_id: input.customerId,
    conversation_id: input.conversationId ?? null,
    case_id: input.caseId ?? null,
    task_id: input.taskId ?? null,
    source_kind: input.sourceKind,
    status: input.preview.skipped ? "skipped" : "completed",
    input_context: JSON.stringify(input.inputContext),
    event_frame: JSON.stringify(input.preview.eventFrame ?? {}),
    candidate_items: JSON.stringify(input.preview.candidateItems ?? []),
    reviewed_items: JSON.stringify(input.preview.reviewedItems ?? []),
    final_items: JSON.stringify(input.preview.skipped ? [] : serializeFinalItems(input.preview.finalItems)),
    metrics: JSON.stringify(
      input.preview.skipped
        ? { reason: input.preview.reason }
        : {
            ...input.preview.metrics,
            ...input.preview.usage
          }
    )
  }).catch(() => null);
}

async function runStructuredEncoding(
  provider: AIProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number
) {
  return provider.complete({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: Math.min(0.35, Math.max(0, temperature)),
    maxTokens: Math.min(2200, Math.max(700, maxTokens)),
    responseFormat: "json_object"
  });
}

function buildConversationTranscript(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return messages
    .slice(-14)
    .map((message) => `${message.role === "user" ? "Customer" : "Assistant"}: ${message.content}`)
    .join("\n");
}

function buildExistingMemoryBlock(existingMemories: ExistingMemoryHint[]) {
  if (existingMemories.length === 0) return "No existing durable memories.";
  return existingMemories
    .map((item) => `[${item.memoryType}] ${item.title ? `${item.title} | ` : ""}${item.summary}`)
    .join("\n");
}

async function encodeMemoryBundle(
  db: Knex,
  input: {
    tenantId: string;
    customerId: string;
    sourceKind: "conversation" | "task";
    framingPrompt: string;
    candidatePrompt: string;
    reviewContext: string;
    sourceMetadata: Record<string, unknown>;
    traceContext: Record<string, unknown>;
    persist?: boolean;
    conversationId?: string | null;
    caseId?: string | null;
    taskId?: string | null;
  }
) {
  const shouldPersist = input.persist !== false;
  const aiSettings = await resolveTenantAISettings(db, input.tenantId);
  if (!aiSettings) {
    const preview = { skipped: true, reason: "no_ai_provider" as const };
    if (shouldPersist) {
      await recordMemoryEncoderTrace(db, {
        tenantId: input.tenantId,
        customerId: input.customerId,
        sourceKind: input.sourceKind,
        inputContext: input.traceContext,
        preview,
        conversationId: input.conversationId,
        caseId: input.caseId,
        taskId: input.taskId
      });
    }
    return { encoded: 0, ...preview };
  }

  const existingMemories = await loadExistingMemoryHints(db, {
    tenantId: input.tenantId,
    customerId: input.customerId
  });

  const frameResult = await runStructuredEncoding(
    aiSettings.provider,
    aiSettings.model,
    EVENT_FRAME_SYSTEM,
    input.framingPrompt,
    aiSettings.temperature,
    Math.min(aiSettings.maxTokens, 1400)
  );
  const eventFrame = parseEventFrame(frameResult.content ?? "");
  if (!eventFrameLooksUseful(eventFrame)) {
    await recordAIUsage(db, {
      tenantId: input.tenantId,
      provider: aiSettings.providerName,
      model: aiSettings.model,
      feature: "orchestrator",
      inputTokens: frameResult.inputTokens,
      outputTokens: frameResult.outputTokens,
      requestCount: 1,
      metadata: {
        source: `memory_encoder_${input.sourceKind}`,
        stage: "frame",
        reason: "empty_event_frame"
      }
    });
    const preview = {
      skipped: true as const,
      reason: "empty_event_frame" as const,
      eventFrame
    };
    if (shouldPersist) {
      await recordMemoryEncoderTrace(db, {
        tenantId: input.tenantId,
        customerId: input.customerId,
        sourceKind: input.sourceKind,
        inputContext: input.traceContext,
        preview,
        conversationId: input.conversationId,
        caseId: input.caseId,
        taskId: input.taskId
      });
    }
    return { encoded: 0, ...preview };
  }

  const candidateResult = await runStructuredEncoding(
    aiSettings.provider,
    aiSettings.model,
    MEMORY_CANDIDATE_SYSTEM,
    [
      input.candidatePrompt,
      "Event frame:",
      JSON.stringify(eventFrame, null, 2)
    ].join("\n\n"),
    aiSettings.temperature,
    Math.min(aiSettings.maxTokens, 1700)
  );
  const candidateItems = parseCandidateItems(candidateResult.content ?? "");
  if (candidateItems.length === 0) {
    await recordAIUsage(db, {
      tenantId: input.tenantId,
      provider: aiSettings.providerName,
      model: aiSettings.model,
      feature: "orchestrator",
      inputTokens: frameResult.inputTokens + candidateResult.inputTokens,
      outputTokens: frameResult.outputTokens + candidateResult.outputTokens,
      requestCount: 2,
      metadata: {
        source: `memory_encoder_${input.sourceKind}`,
        stage: "candidate",
        reason: "empty_candidate_items"
      }
    });
    const preview = {
      skipped: true as const,
      reason: "empty_candidate_items" as const,
      eventFrame,
      candidateItems
    };
    if (shouldPersist) {
      await recordMemoryEncoderTrace(db, {
        tenantId: input.tenantId,
        customerId: input.customerId,
        sourceKind: input.sourceKind,
        inputContext: input.traceContext,
        preview,
        conversationId: input.conversationId,
        caseId: input.caseId,
        taskId: input.taskId
      });
    }
    return { encoded: 0, ...preview };
  }

  const reviewResult = await runStructuredEncoding(
    aiSettings.provider,
    aiSettings.model,
    MEMORY_REVIEW_SYSTEM,
    [
      input.reviewContext,
      "Existing memories:",
      buildExistingMemoryBlock(existingMemories),
      "Candidate items:",
      JSON.stringify(candidateItems, null, 2)
    ].join("\n\n"),
    0.1,
    Math.min(aiSettings.maxTokens, 1800)
  );

  const reviewedItems = dedupeReviewedItems(parseReviewedItems(reviewResult.content ?? "", candidateItems));
  if (reviewedItems.length === 0) {
    await recordAIUsage(db, {
      tenantId: input.tenantId,
      provider: aiSettings.providerName,
      model: aiSettings.model,
      feature: "orchestrator",
      inputTokens: frameResult.inputTokens + candidateResult.inputTokens + reviewResult.inputTokens,
      outputTokens: frameResult.outputTokens + candidateResult.outputTokens + reviewResult.outputTokens,
      requestCount: 3,
      metadata: {
        source: `memory_encoder_${input.sourceKind}`,
        stage: "review",
        reason: "all_candidates_rejected"
      }
    });
    const preview = {
      skipped: true as const,
      reason: "all_candidates_rejected" as const,
      eventFrame,
      candidateItems,
      reviewedItems: []
    };
    if (shouldPersist) {
      await recordMemoryEncoderTrace(db, {
        tenantId: input.tenantId,
        customerId: input.customerId,
        sourceKind: input.sourceKind,
        inputContext: input.traceContext,
        preview,
        conversationId: input.conversationId,
        caseId: input.caseId,
        taskId: input.taskId
      });
    }
    return { encoded: 0, ...preview };
  }

  const preview: MemoryEncodingPreview = {
    skipped: false,
    eventFrame,
    candidateItems,
    reviewedItems,
    finalItems: reviewedItems,
    metrics: {
      existingMemoryCount: existingMemories.length,
      candidateCount: candidateItems.length,
      reviewedCount: reviewedItems.length,
      finalCount: reviewedItems.length,
      resolutionStatus: eventFrame.resolutionStatus
    },
    usage: {
      inputTokens: frameResult.inputTokens + candidateResult.inputTokens + reviewResult.inputTokens,
      outputTokens: frameResult.outputTokens + candidateResult.outputTokens + reviewResult.outputTokens,
      requestCount: 3
    }
  };

  if (shouldPersist) {
    await recordCustomerMemoryItems(db, {
      tenantId: input.tenantId,
      customerId: input.customerId,
      conversationId: input.conversationId ?? null,
      caseId: input.caseId ?? null,
      taskId: input.taskId ?? null,
      source: "memory_encoder",
      items: reviewedItems.map((item) => ({
        memoryType: item.type,
        title: item.title,
        summary: item.summary,
        detail: item.detail,
        content: {
          ...input.sourceMetadata,
          encoderStage: "reviewed",
          evidence: item.evidence ?? null,
          reviewReason: item.reason ?? null
        },
        confidence: item.confidence ?? 0.8,
        salience: item.salience ?? defaultSalience(item.type),
        expiresAt: expiresAtFromDays(item.expiresInDays)
      }))
    });
  }

  await recordAIUsage(db, {
    tenantId: input.tenantId,
    provider: aiSettings.providerName,
    model: aiSettings.model,
    feature: "orchestrator",
    inputTokens: preview.usage.inputTokens,
    outputTokens: preview.usage.outputTokens,
    requestCount: preview.usage.requestCount,
    metadata: {
      source: `memory_encoder_${input.sourceKind}`,
      encodedCount: reviewedItems.length,
      resolutionStatus: eventFrame.resolutionStatus
    }
  });

  if (shouldPersist) {
    await recordMemoryEncoderTrace(db, {
      tenantId: input.tenantId,
      customerId: input.customerId,
      sourceKind: input.sourceKind,
      inputContext: input.traceContext,
      preview,
      conversationId: input.conversationId,
      caseId: input.caseId,
      taskId: input.taskId
    });
  }

  return { encoded: reviewedItems.length, skipped: false as const };
}

export async function previewConversationMemories(
  db: Knex,
  input: ConversationEncodingInput & { persist?: boolean }
) {
  const transcript = buildConversationTranscript(input.messages);
  const result = await encodeMemoryBundle(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    sourceKind: "conversation",
    conversationId: input.conversationId,
    caseId: input.caseId ?? null,
    sourceMetadata: {
      origin: "conversation_encoder",
      lastIntent: input.lastIntent,
      lastSentiment: input.lastSentiment
    },
    persist: input.persist,
    traceContext: {
      conversationSummary: input.conversationSummary,
      lastIntent: input.lastIntent,
      lastSentiment: input.lastSentiment,
      transcript
    },
    framingPrompt: [
      `Conversation summary: ${input.conversationSummary}`,
      `Intent: ${input.lastIntent}`,
      `Sentiment: ${input.lastSentiment}`,
      input.finalResponse ? `Final assistant response: ${input.finalResponse}` : null,
      "Recent transcript:",
      transcript
    ].filter(Boolean).join("\n\n"),
    candidatePrompt: [
      `Conversation summary: ${input.conversationSummary}`,
      `Intent: ${input.lastIntent}`,
      `Sentiment: ${input.lastSentiment}`,
      "Generate high-quality customer memories from this conversation event."
    ].join("\n\n"),
    reviewContext: [
      "Review these conversation-derived memories for durability and retrieval value.",
      `Conversation ID: ${input.conversationId}`,
      `Intent: ${input.lastIntent}`,
      `Sentiment: ${input.lastSentiment}`
    ].join("\n")
  });
  return result;
}

export async function previewTaskOutcomeMemories(
  db: Knex,
  input: TaskEncodingInput & { persist?: boolean }
) {
  const payloadPreview = JSON.stringify(input.payload).slice(0, 5000);
  return encodeMemoryBundle(db, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    sourceKind: "task",
    conversationId: input.conversationId ?? null,
    caseId: input.caseId ?? null,
    taskId: input.taskId,
    sourceMetadata: {
      origin: "task_encoder",
      taskType: input.taskType,
      taskTitle: input.title
    },
    persist: input.persist,
    traceContext: {
      taskType: input.taskType,
      taskTitle: input.title,
      resultSummary: input.resultSummary,
      payloadPreview
    },
    framingPrompt: [
      `Task type: ${input.taskType}`,
      `Task title: ${input.title}`,
      `Result summary: ${input.resultSummary}`,
      `Task payload: ${payloadPreview}`
    ].join("\n\n"),
    candidatePrompt: [
      `Task type: ${input.taskType}`,
      `Task title: ${input.title}`,
      `Result summary: ${input.resultSummary}`,
      "Generate high-quality customer memories from this task result."
    ].join("\n\n"),
    reviewContext: [
      "Review these task-derived memories for durability and retrieval value.",
      `Task ID: ${input.taskId}`,
      `Task type: ${input.taskType}`
    ].join("\n")
  });
}

export async function encodeConversationMemories(
  db: Knex,
  input: ConversationEncodingInput
) {
  return previewConversationMemories(db, input);
}

export async function encodeTaskOutcomeMemories(
  db: Knex,
  input: TaskEncodingInput
) {
  return previewTaskOutcomeMemories(db, input);
}
