import type { Knex } from "knex";

import { db, withTenantTransaction } from "../../infra/db/client.js";
import { waMonitorAnalysisQueue, type WaMonitorAnalysisJobPayload } from "../../infra/queue/queues.js";
import { listWaAccounts } from "./wa-account.repository.js";
import {
  getConversationMembers,
  getConversationMessages,
  getWaConversationById,
  listWaConversations
} from "./wa-conversation.repository.js";
import { resolveTenantAISettings } from "../ai/provider-config.service.js";

type AlertSeverity = "warning" | "critical";
type WaMonitorReportQuery = {
  tenantId: string;
  startAt: Date;
  endAt: Date;
  waAccountId?: string | null;
  membershipId?: string | null;
  requiresReply?: boolean | null;
  isReplied?: boolean | null;
  page?: number;
  pageSize?: number;
};

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_BATCH_LIMIT = 10;
const DEFAULT_JUDGMENT_PROMPT = [
  "你是 WA 客服对话监控助手，需要判断客户入站消息是否需要客服人工回复。",
  "请结合当前消息、群聊/私聊类型、上下文和前端维护的识别条件判断。",
  "业务判断口径以前端配置为准；代码只提供 direction、senderMemberId、isSystemSide、senderJid 和上下文消息等系统事实。"
].join("\n");
const DEFAULT_JUDGMENT_CONDITION = [
  "请在前端 WA智能对话判断 中维护具体识别条件。",
  "未维护前仅使用最小兜底判断；生产建议保存正式判断说明和识别条件。"
].join("\n");

type WaMonitorJudgmentConfigRow = {
  config_id: string;
  tenant_id: string;
  is_enabled: boolean | null;
  judgment_prompt: string | null;
  condition_text: string | null;
  created_by_membership_id: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
};

export async function processWaMonitorAnalysisJob(input: WaMonitorAnalysisJobPayload) {
  if (!input.tenantId) {
    return {
      skipped: true,
      reason: "wa monitor analysis requires tenantId"
    };
  }
  return backfillAdminWaMonitorFacts({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId ?? null,
    limit: BACKFILL_BATCH_LIMIT
  });
}

export async function triggerWaMonitorAnalysisScan(input: WaMonitorAnalysisJobPayload) {
  if (!input.tenantId) {
    throw new Error("tenantId is required for WA monitor analysis scan");
  }
  const tenantScope = input.tenantId;
  const accountScope = input.waAccountId ?? "all";
  await waMonitorAnalysisQueue.add("wa.monitor.analysis", input, {
    jobId: `wa-monitor:scan:${tenantScope}:${accountScope}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 500
  });
  return { queued: true };
}

export async function ensureWaMonitorAnalysisRepeatForTenant(tenantId: string) {
  await waMonitorAnalysisQueue.add("wa.monitor.analysis", { tenantId }, {
    jobId: `wa-monitor:scan:repeat:${tenantId}`,
    repeat: { every: 60 * 1000 },
    removeOnComplete: true,
    removeOnFail: 100
  });
  return { queued: true };
}

async function removeWaMonitorAnalysisRepeatForTenant(tenantId: string) {
  await waMonitorAnalysisQueue.removeRepeatable(
    "wa.monitor.analysis",
    { every: 60 * 1000 },
    `wa-monitor:scan:repeat:${tenantId}`
  );
  return { removed: true };
}

export async function syncWaMonitorAnalysisRepeatForTenant(tenantId: string) {
  const activeTarget = await db("wa_monitor_targets")
    .where({ tenant_id: tenantId, is_active: true })
    .select("target_id")
    .first();
  return activeTarget
    ? ensureWaMonitorAnalysisRepeatForTenant(tenantId)
    : removeWaMonitorAnalysisRepeatForTenant(tenantId);
}

export async function recoverWaMonitorAnalysisRepeats() {
  const rows = await db("wa_monitor_targets")
    .where("is_active", true)
    .distinct("tenant_id");
  let recovered = 0;
  for (const row of rows as Array<Record<string, unknown>>) {
    const tenantId = asString(row.tenant_id);
    if (!tenantId) continue;
    await ensureWaMonitorAnalysisRepeatForTenant(tenantId);
    recovered += 1;
  }
  return { recovered };
}

function toStatusCode(statusCode: string) {
  if (statusCode === "connected") return "ready";
  if (["qr_required", "qr_scanned", "connecting"].includes(statusCode)) return "connecting";
  if (statusCode === "session_expired") return "session_expired";
  return "offline";
}

function toTimeRange(date: string) {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePhoneE164(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : null;
}

function derivePhoneE164FromJid(jid: string | null) {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return null;
  const local = jid.split("@")[0] ?? "";
  return /^[0-9]+$/.test(local) ? normalizePhoneE164(local) : null;
}

function extractPayloadPushName(value: unknown) {
  try {
    if (!value) return null;
    const payload = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>;
    return asString(payload?.pushName);
  } catch {
    return null;
  }
}

function buildMessageTimestampSql(alias: string) {
  return `coalesce(to_timestamp(${alias}.provider_ts / 1000.0), ${alias}.created_at)`;
}

function normalizePagination(input: { page?: number; pageSize?: number }) {
  const page = Number.isFinite(input.page) ? Math.max(1, Number(input.page)) : 1;
  const pageSize = Number.isFinite(input.pageSize) ? Math.max(1, Math.min(Number(input.pageSize), 500)) : 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function mapPagedResult<T>(input: { rows: T[]; total: number; page: number; pageSize: number }) {
  return {
    rows: input.rows,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: input.total
    }
  };
}

function normalizeConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mapJudgmentConfig(row: WaMonitorJudgmentConfigRow | undefined) {
  return {
    configId: row?.config_id ?? null,
    tenantId: row?.tenant_id ?? null,
    isEnabled: row?.is_enabled ?? true,
    judgmentPrompt: row?.judgment_prompt ?? DEFAULT_JUDGMENT_PROMPT,
    conditionText: row?.condition_text ?? DEFAULT_JUDGMENT_CONDITION,
    createdByMembershipId: row?.created_by_membership_id ?? null,
    createdAt: toIso(row?.created_at),
    updatedAt: toIso(row?.updated_at)
  };
}

function normalizeJudgmentText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 8000) : fallback;
}

function analyzeRequiresReply(input: {
  conversationType: string;
  bodyText: string | null;
  messageType: string;
}) {
  const body = (input.bodyText ?? "").trim();
  if (input.conversationType !== "group") {
    return {
      requiresReply: input.messageType !== "reaction",
      reason: input.messageType === "reaction" ? "私聊表情回应，无需单独回复" : "私聊客户入站消息默认需要客服关注",
      confidence: input.messageType === "reaction" ? 0.72 : 0.9
    };
  }

  if (!body && ["reaction", "sticker"].includes(input.messageType)) {
    return { requiresReply: false, reason: "群聊非文本互动，暂不计入需回复", confidence: 0.78 };
  }

  const lower = body.toLowerCase();
  const hasQuestion =
    /[?？]/.test(body) ||
    /(吗|么|呢|如何|怎么|怎样|是否|能不能|可不可以|有没有|请问)/.test(body) ||
    /\b(can|could|would|should|how|what|when|where|why|please|help)\b/i.test(lower);
  const hasServiceIntent =
    /(订单|物流|发货|退款|售后|价格|报价|库存|地址|付款|支付|确认|处理|进度|问题|异常|投诉|urgent|order|refund|shipping|delivery|price|stock|issue|problem)/i.test(body);
  const hasMention = /@\S+/.test(body);
  const requiresReply = hasQuestion || (hasServiceIntent && (hasMention || body.length <= 160));
  return {
    requiresReply,
    reason: requiresReply ? "群聊消息包含问题或明确业务处理意图" : "群聊消息未识别出明确客服回复诉求",
    confidence: normalizeConfidence(requiresReply ? (hasQuestion ? 0.84 : 0.76) : 0.68)
  };
}

function parseAIJudgmentResponse(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const requiresReply = typeof parsed.requiresReply === "boolean"
      ? parsed.requiresReply
      : (typeof parsed.needs_response === "boolean" ? parsed.needs_response : null);
    if (typeof requiresReply !== "boolean") return null;
    const confidence = typeof parsed.confidence === "number"
      ? parsed.confidence
      : (typeof parsed.confidence === "string" ? Number(parsed.confidence) : 0.75);
    return {
      requiresReply,
      reason: asString(parsed.reason) ?? (requiresReply ? "AI判断需要客服回复" : "AI判断无需客服回复"),
      confidence: normalizeConfidence(Number.isFinite(confidence) ? confidence : 0.75)
    };
  } catch {
    return null;
  }
}

async function loadJudgmentContext(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; logicalSeq: number | null }
) {
  if (input.logicalSeq == null || !Number.isFinite(input.logicalSeq)) return [];
  const messageTs = buildMessageTimestampSql("m");
  const rows = await trx("wa_messages as m")
    .leftJoin("wa_conversation_members as cm", function joinConversationMember() {
      this.on("cm.tenant_id", "=", "m.tenant_id")
        .andOn("cm.wa_conversation_id", "=", "m.wa_conversation_id")
        .andOn(function joinSender() {
          this.on("cm.participant_jid", "=", "m.participant_jid")
            .orOn("cm.participant_jid", "=", "m.sender_jid");
        });
    })
    .where("m.tenant_id", input.tenantId)
    .where("m.wa_conversation_id", input.waConversationId)
    .whereBetween("m.logical_seq", [input.logicalSeq - 4, input.logicalSeq + 2])
    .whereNull("m.deleted_for_me_at")
    .select(
      "m.wa_message_id",
      "m.direction",
      "m.body_text",
      "m.message_type",
      "m.logical_seq",
      "m.participant_jid",
      "m.sender_jid",
      "cm.display_name",
      trx.raw(`${messageTs} as message_at`)
    )
    .orderBy("m.logical_seq", "asc");

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    direction: String(row.direction),
    isSystemSide: String(row.direction) === "outbound",
    messageType: String(row.message_type),
    bodyText: asString(row.body_text) ?? "",
    senderName: asString(row.display_name),
    senderPhone: derivePhoneE164FromJid(asString(row.participant_jid) ?? asString(row.sender_jid)),
    senderJid: asString(row.participant_jid) ?? asString(row.sender_jid),
    messageAt: toIso(row.message_at as string | Date | null)
  }));
}

async function analyzeRequiresReplyForTenant(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waConversationId: string;
    logicalSeq: number | null;
    conversationType: string;
    bodyText: string | null;
    messageType: string;
    direction: string;
    senderMemberId: string | null;
    senderJid: string | null;
    participantJid: string | null;
  }
) {
  const prepared = await prepareRequiresReplyForTenant(trx, input);
  return completeRequiresReplyAnalysis(input, prepared);
}

async function prepareRequiresReplyForTenant(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waConversationId: string;
    logicalSeq: number | null;
    conversationType: string;
    bodyText: string | null;
    messageType: string;
  }
) {
  const fallback = analyzeRequiresReply({
    conversationType: input.conversationType,
    bodyText: input.bodyText,
    messageType: input.messageType
  });
  const config = await getAdminWaMonitorJudgmentConfig(trx, input.tenantId);
  const aiSettings = config.isEnabled ? await resolveTenantAISettings(trx, input.tenantId) : null;
  const context = config.isEnabled && aiSettings
    ? await loadJudgmentContext(trx, {
        tenantId: input.tenantId,
        waConversationId: input.waConversationId,
        logicalSeq: input.logicalSeq
      })
    : [];

  return {
    fallback,
    config,
    aiSettings,
    context
  };
}

async function completeRequiresReplyAnalysis(
  input: {
    tenantId: string;
    conversationType: string;
    bodyText: string | null;
    messageType: string;
    direction: string;
    senderMemberId: string | null;
    senderJid: string | null;
    participantJid: string | null;
  },
  prepared: Awaited<ReturnType<typeof prepareRequiresReplyForTenant>>
) {
  const { fallback, config, aiSettings, context } = prepared;
  if (!config.isEnabled) {
    return { ...fallback, modelProvider: "heuristic", modelName: "wa-monitor-v1", inputTokens: 0, outputTokens: 0 };
  }
  if (!aiSettings) {
    return {
      ...fallback,
      reason: `AI配置不可用，使用兜底规则: ${fallback.reason}`,
      modelProvider: "heuristic",
      modelName: "wa-monitor-v1",
      inputTokens: 0,
      outputTokens: 0
    };
  }

  try {
    const completion = await aiSettings.provider.complete({
      tenantId: input.tenantId,
      model: aiSettings.model,
      temperature: 0,
      maxTokens: 300,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content: [
            "你必须只输出 JSON 对象，不要输出解释性前后缀。",
            "JSON 格式: {\"requiresReply\": boolean, \"reason\": string, \"confidence\": number}。",
            "如果配置文档要求输出 needs_response，请将 needs_response 的判断映射到 requiresReply。",
            "confidence 必须是 0 到 1 的数字。",
            "",
            "判断说明:",
            config.judgmentPrompt,
            "",
            "判断条件:",
            config.conditionText
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            conversationType: input.conversationType,
            messageType: input.messageType,
            currentSender: {
              direction: input.direction,
              isSystemSide: input.direction === "outbound" || Boolean(input.senderMemberId),
              senderMemberId: input.senderMemberId,
              senderJid: input.participantJid ?? input.senderJid
            },
            currentMessage: input.bodyText ?? "",
            contextMessages: context
          })
        }
      ]
    });
    const parsed = parseAIJudgmentResponse(completion.content);
    if (!parsed) throw new Error("Invalid AI judgment response");
    return {
      ...parsed,
      modelProvider: aiSettings.providerName,
      modelName: completion.model || aiSettings.model,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens
    };
  } catch {
    return {
      ...fallback,
      reason: `AI判断失败，使用兜底规则: ${fallback.reason}`,
      modelProvider: "heuristic",
      modelName: "wa-monitor-v1",
      inputTokens: 0,
      outputTokens: 0
    };
  }
}

function mapMonitorTarget(row: Record<string, unknown>) {
  return {
    targetId: String(row.target_id),
    tenantId: String(row.tenant_id),
    waAccountId: String(row.wa_account_id),
    waConversationId: String(row.wa_conversation_id),
    conversationType: String(row.conversation_type),
    isActive: Boolean(row.is_active),
    createdByMembershipId: row.created_by_membership_id ? String(row.created_by_membership_id) : null,
    createdAt: toIso(row.created_at as string | Date | null),
    updatedAt: toIso(row.updated_at as string | Date | null)
  };
}

function mapMonitorAlert(input: {
  code: string;
  severity: AlertSeverity;
  waAccountId?: string | null;
  waConversationId?: string | null;
  title: string;
  detail: string;
}) {
  return {
    code: input.code,
    severity: input.severity,
    waAccountId: input.waAccountId ?? null,
    waConversationId: input.waConversationId ?? null,
    title: input.title,
    detail: input.detail
  };
}

export async function listAdminWaMonitorTargets(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId?: string | null; activeOnly?: boolean }
) {
  const rows = await trx("wa_monitor_targets")
    .where("tenant_id", input.tenantId)
    .modify((qb) => {
      if (input.waAccountId) qb.where("wa_account_id", input.waAccountId);
      if (input.activeOnly) qb.where("is_active", true);
    })
    .orderBy("updated_at", "desc");
  return (rows as Array<Record<string, unknown>>).map((row) => mapMonitorTarget(row));
}

export async function getAdminWaMonitorJudgmentConfig(
  trx: Knex.Transaction,
  tenantId: string
) {
  const row = await trx<WaMonitorJudgmentConfigRow>("wa_monitor_judgment_configs")
    .where("tenant_id", tenantId)
    .first();
  return mapJudgmentConfig(row);
}

export async function updateAdminWaMonitorJudgmentConfig(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string | null;
    isEnabled?: boolean;
    judgmentPrompt?: string;
    conditionText?: string;
  }
) {
  const current = await getAdminWaMonitorJudgmentConfig(trx, input.tenantId);
  const nextIsEnabled = input.isEnabled ?? current.isEnabled;
  const nextJudgmentPrompt = normalizeJudgmentText(input.judgmentPrompt, current.judgmentPrompt);
  const nextConditionText = normalizeJudgmentText(input.conditionText, current.conditionText);
  const [row] = await trx("wa_monitor_judgment_configs")
    .insert({
      tenant_id: input.tenantId,
      is_enabled: nextIsEnabled,
      judgment_prompt: nextJudgmentPrompt,
      condition_text: nextConditionText,
      created_by_membership_id: input.membershipId,
      updated_at: trx.fn.now()
    })
    .onConflict(["tenant_id"])
    .merge({
      is_enabled: nextIsEnabled,
      judgment_prompt: nextJudgmentPrompt,
      condition_text: nextConditionText,
      updated_at: trx.fn.now()
    })
    .returning("*");
  return mapJudgmentConfig(row as WaMonitorJudgmentConfigRow);
}

export async function setAdminWaMonitorTarget(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    waConversationId: string;
    isActive: boolean;
    membershipId: string | null;
  }
) {
  const conversation = await getWaConversationById(trx, input.tenantId, input.waConversationId);
  if (!conversation || conversation.waAccountId !== input.waAccountId) {
    throw new Error("Conversation not found");
  }

  const [row] = await trx("wa_monitor_targets")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      wa_conversation_id: input.waConversationId,
      conversation_type: conversation.conversationType,
      is_active: input.isActive,
      created_by_membership_id: input.membershipId,
      updated_at: trx.fn.now()
    })
    .onConflict(["tenant_id", "wa_conversation_id"])
    .merge({
      wa_account_id: input.waAccountId,
      conversation_type: conversation.conversationType,
      is_active: input.isActive,
      updated_at: trx.fn.now()
    })
    .returning("*");

  return mapMonitorTarget(row as Record<string, unknown>);
}

export async function processWaMonitorMessage(
  trx: Knex.Transaction,
  input: { tenantId: string; waMessageId: string }
) {
  const messageTs = buildMessageTimestampSql("m");
  const row = await trx("wa_messages as m")
    .join("wa_conversations as c", function joinConversation() {
      this.on("c.wa_conversation_id", "=", "m.wa_conversation_id").andOn("c.tenant_id", "=", "m.tenant_id");
    })
    .join("wa_monitor_targets as t", function joinTarget() {
      this.on("t.wa_conversation_id", "=", "m.wa_conversation_id").andOn("t.tenant_id", "=", "m.tenant_id");
    })
    .where("m.tenant_id", input.tenantId)
    .where("m.wa_message_id", input.waMessageId)
    .where("t.is_active", true)
    .whereNull("m.deleted_for_me_at")
    .select(
      "m.wa_message_id",
      "m.wa_account_id",
      "m.wa_conversation_id",
      "m.direction",
      "m.sender_member_id",
      "m.sender_jid",
      "m.participant_jid",
      "m.body_text",
      "m.message_type",
      "m.logical_seq",
      "c.conversation_type",
      trx.raw(`${messageTs} as message_at`)
    )
    .first<Record<string, unknown> | undefined>();
  if (!row) return { skipped: true };

  const direction = String(row.direction);
  const messageAt = new Date(String(row.message_at));
  if (direction === "inbound") {
    return { skipped: true, reason: "inbound monitor analysis is handled by detached worker" };
  }

  if (direction === "outbound" && row.sender_member_id) {
    const unresolved = await trx("wa_conversation_reply_facts")
      .where({
        tenant_id: input.tenantId,
        wa_conversation_id: row.wa_conversation_id,
        requires_reply: true
      })
      .whereNull("first_reply_at")
      .where("customer_message_at", "<", messageAt)
      .select("fact_id", "customer_message_at");

    for (const fact of unresolved) {
      const customerAt = new Date(String(fact.customer_message_at));
      await trx("wa_conversation_reply_facts")
        .where({ tenant_id: input.tenantId, fact_id: fact.fact_id })
        .update({
          first_reply_wa_message_id: row.wa_message_id,
          first_reply_at: messageAt,
          replied_by_membership_id: row.sender_member_id,
          reply_duration_sec: Math.max(0, Math.round((messageAt.getTime() - customerAt.getTime()) / 1000)),
          updated_at: trx.fn.now()
        });
    }
    return { processed: true, resolvedFacts: unresolved.length };
  }

  return { skipped: true };
}

async function processWaMonitorInboundMessageDetached(
  input: { tenantId: string; waMessageId: string }
) {
  const row = await withTenantTransaction(input.tenantId, async (trx) => {
    const messageTs = buildMessageTimestampSql("m");
    return trx("wa_messages as m")
      .join("wa_conversations as c", function joinConversation() {
        this.on("c.wa_conversation_id", "=", "m.wa_conversation_id").andOn("c.tenant_id", "=", "m.tenant_id");
      })
      .join("wa_monitor_targets as t", function joinTarget() {
        this.on("t.wa_conversation_id", "=", "m.wa_conversation_id").andOn("t.tenant_id", "=", "m.tenant_id");
      })
      .where("m.tenant_id", input.tenantId)
      .where("m.wa_message_id", input.waMessageId)
      .where("m.direction", "inbound")
      .where("t.is_active", true)
      .whereNull("m.deleted_for_me_at")
      .select(
        "m.wa_message_id",
        "m.wa_account_id",
        "m.wa_conversation_id",
        "m.direction",
        "m.sender_member_id",
        "m.sender_jid",
        "m.participant_jid",
        "m.body_text",
        "m.message_type",
        "m.logical_seq",
        "c.conversation_type",
        trx.raw(`${messageTs} as message_at`)
      )
      .first<Record<string, unknown> | undefined>();
  });
  if (!row) return { skipped: true };

  const analysisInput = {
    tenantId: input.tenantId,
    waConversationId: String(row.wa_conversation_id),
    logicalSeq: row.logical_seq == null ? null : Number(row.logical_seq),
    conversationType: String(row.conversation_type),
    bodyText: row.body_text ? String(row.body_text) : null,
    messageType: String(row.message_type),
    direction: String(row.direction),
    senderMemberId: row.sender_member_id ? String(row.sender_member_id) : null,
    senderJid: asString(row.sender_jid),
    participantJid: asString(row.participant_jid)
  };
  const prepared = await withTenantTransaction(input.tenantId, async (trx) =>
    prepareRequiresReplyForTenant(trx, analysisInput)
  );
  const analysis = await completeRequiresReplyAnalysis(analysisInput, prepared);
  const messageAt = new Date(String(row.message_at));

  await withTenantTransaction(input.tenantId, async (trx) => {
    await trx("wa_message_monitor_analysis")
      .insert({
        tenant_id: input.tenantId,
        wa_account_id: row.wa_account_id,
        wa_conversation_id: row.wa_conversation_id,
        wa_message_id: row.wa_message_id,
        requires_reply: analysis.requiresReply,
        reason: analysis.reason,
        confidence: analysis.confidence,
        model_provider: analysis.modelProvider,
        model_name: analysis.modelName,
        input_tokens: analysis.inputTokens,
        output_tokens: analysis.outputTokens
      })
      .onConflict(["tenant_id", "wa_message_id"])
      .merge({
        requires_reply: analysis.requiresReply,
        reason: analysis.reason,
        confidence: analysis.confidence,
        model_provider: analysis.modelProvider,
        model_name: analysis.modelName,
        input_tokens: analysis.inputTokens,
        output_tokens: analysis.outputTokens
      });

    const replyTs = buildMessageTimestampSql("r");
    const reply = analysis.requiresReply
      ? await trx("wa_messages as r")
          .where("r.tenant_id", input.tenantId)
          .where("r.wa_conversation_id", String(row.wa_conversation_id))
          .where("r.direction", "outbound")
          .whereNotNull("r.sender_member_id")
          .whereRaw(`${replyTs} > ?`, [messageAt])
          .select("r.wa_message_id", "r.sender_member_id", trx.raw(`${replyTs} as reply_at`))
          .orderByRaw(`${replyTs} asc`)
          .first<Record<string, unknown> | undefined>()
      : null;

    const replyAt = reply?.reply_at ? new Date(String(reply.reply_at)) : null;
    await trx("wa_conversation_reply_facts")
      .insert({
        tenant_id: input.tenantId,
        wa_account_id: row.wa_account_id,
        wa_conversation_id: row.wa_conversation_id,
        source_wa_message_id: row.wa_message_id,
        requires_reply: analysis.requiresReply,
        customer_message_at: messageAt,
        first_reply_wa_message_id: reply?.wa_message_id ?? null,
        first_reply_at: replyAt,
        replied_by_membership_id: reply?.sender_member_id ?? null,
        reply_duration_sec: replyAt ? Math.max(0, Math.round((replyAt.getTime() - messageAt.getTime()) / 1000)) : null,
        updated_at: trx.fn.now()
      })
      .onConflict(["tenant_id", "source_wa_message_id"])
      .merge({
        requires_reply: analysis.requiresReply,
        first_reply_wa_message_id: reply?.wa_message_id ?? null,
        first_reply_at: replyAt,
        replied_by_membership_id: reply?.sender_member_id ?? null,
        reply_duration_sec: replyAt ? Math.max(0, Math.round((replyAt.getTime() - messageAt.getTime()) / 1000)) : null,
        updated_at: trx.fn.now()
      });
  });

  return { processed: true, requiresReply: analysis.requiresReply };
}

export async function backfillAdminWaMonitorFacts(
  input: { tenantId: string; waAccountId?: string | null; limit?: number }
) {
  const requestedLimit = Math.max(1, Math.min(input.limit ?? BACKFILL_BATCH_LIMIT, 500));
  const limit = Math.min(requestedLimit, BACKFILL_BATCH_LIMIT);
  const rows = await withTenantTransaction(input.tenantId, async (trx) =>
    trx("wa_messages as m")
      .join("wa_monitor_targets as t", function joinTarget() {
        this.on("t.wa_conversation_id", "=", "m.wa_conversation_id").andOn("t.tenant_id", "=", "m.tenant_id");
      })
      .leftJoin("wa_message_monitor_analysis as a", function joinAnalysis() {
        this.on("a.wa_message_id", "=", "m.wa_message_id").andOn("a.tenant_id", "=", "m.tenant_id");
      })
      .where("m.tenant_id", input.tenantId)
      .where("t.is_active", true)
      .where("m.direction", "inbound")
      .where((qb) => {
        qb.whereNull("a.analysis_id")
          .orWhere((failedQb) => {
            failedQb
              .where("a.model_provider", "heuristic")
              .where("a.reason", "like", "AI判断失败%");
          });
      })
      .modify((qb) => {
        if (input.waAccountId) qb.where("m.wa_account_id", input.waAccountId);
      })
      .select("m.wa_message_id")
      .orderBy("m.created_at", "desc")
      .limit(limit)
  );

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await processWaMonitorInboundMessageDetached({
        tenantId: input.tenantId,
        waMessageId: String(row.wa_message_id)
      });
      if ("processed" in result) processed += 1;
    } catch (error) {
      failed += 1;
      console.warn("[wa-monitor] failed to backfill message:", row.wa_message_id, error);
    }
  }

  return {
    scanned: rows.length,
    processed,
    failed,
    requestedLimit,
    batchLimit: limit,
    hasMore: rows.length === limit
  };
}

async function listLatestHumanReplyGaps(
  trx: Knex.Transaction,
  tenantId: string,
  input?: { waAccountIds?: string[]; limit?: number }
) {
  const messageTs = buildMessageTimestampSql("m");
  const outboundTs = buildMessageTimestampSql("m2");
  const inboundBase = trx("wa_messages as m")
    .join("wa_conversations as c", function joinConversation() {
      this.on("c.wa_conversation_id", "=", "m.wa_conversation_id").andOn("c.tenant_id", "=", "m.tenant_id");
    })
    .where("m.tenant_id", tenantId)
    .where("m.direction", "inbound")
    .whereNot("c.chat_jid", "status@broadcast")
    .whereRaw("c.chat_jid not like ?", ["%@newsletter"])
    .modify((qb) => {
      if (input?.waAccountIds?.length) qb.whereIn("m.wa_account_id", input.waAccountIds);
    })
    .select(
      "m.wa_message_id",
      "m.wa_account_id",
      "m.wa_conversation_id",
      "m.body_text",
      "m.provider_payload",
      "c.chat_jid",
      "c.unread_count",
      trx.raw(`${messageTs} as inbound_at`),
      trx.raw(`(
        select ${outboundTs}
        from wa_messages m2
        where m2.tenant_id = m.tenant_id
          and m2.wa_conversation_id = m.wa_conversation_id
          and m2.direction = 'outbound'
          and m2.sender_member_id is not null
          and ${outboundTs} > ${messageTs}
        order by ${outboundTs} asc
        limit 1
      ) as first_human_reply_at`)
    )
    .orderBy("m.wa_conversation_id", "asc")
    .orderByRaw(`${messageTs} desc`)
    .as("inbound_base");

  const rows = await trx
    .from(
      trx
        .select("*")
        .from(inboundBase)
        .distinctOn("wa_conversation_id")
        .orderBy("wa_conversation_id", "asc")
        .orderBy("inbound_at", "desc")
        .as("latest_inbound")
    )
    .whereNull("first_human_reply_at")
    .orderBy("inbound_at", "asc")
    .limit(input?.limit ?? 200);

  return rows as Array<Record<string, unknown>>;
}

export async function getAdminWaMonitorDashboard(trx: Knex.Transaction, tenantId: string) {
  type AccountConversationAggregate = {
    wa_account_id: string;
    conversation_count?: string | number | null;
    unread_count?: string | number | null;
  };
  const [accounts, aggregates] = await Promise.all([
    listWaAccounts(trx, tenantId),
    trx("wa_conversations")
      .where({ tenant_id: tenantId })
      .whereNot("chat_jid", "status@broadcast")
      .whereRaw("chat_jid not like ?", ["%@newsletter"])
      .select("wa_account_id")
      .count("wa_conversation_id as conversation_count")
      .sum("unread_count as unread_count")
      .groupBy("wa_account_id") as unknown as Promise<AccountConversationAggregate[]>,
  ]);

  const aggregateMap = new Map(
    aggregates.map((row) => [
      String(row.wa_account_id),
      {
        conversationCount: Number(row.conversation_count ?? 0),
        unreadMessageCount: Number(row.unread_count ?? 0)
      }
    ])
  );

  const now = Date.now();
  const alerts: Array<ReturnType<typeof mapMonitorAlert>> = [];
  const accountItems = accounts.map((account) => {
    const metrics = aggregateMap.get(account.waAccountId) ?? { conversationCount: 0, unreadMessageCount: 0 };
    const monitorStatus = toStatusCode(account.status.code);
    const lastOnlineAt = account.lastConnectedAt;
    const sessionExpired = account.status.code === "session_expired";
    const lastHeartbeatAt = account.session?.heartbeatAt ? new Date(account.session.heartbeatAt).getTime() : null;
    const offlineAgeMs = monitorStatus === "offline"
      ? (lastHeartbeatAt ? now - lastHeartbeatAt : (lastOnlineAt ? now - new Date(lastOnlineAt).getTime() : null))
      : null;
    const accountAlerts: Array<ReturnType<typeof mapMonitorAlert>> = [];

    if (sessionExpired) {
      accountAlerts.push(mapMonitorAlert({
        code: "session_expired",
        severity: "critical",
        waAccountId: account.waAccountId,
        title: `${account.displayName} 会话失效`,
        detail: "当前账号会话已失效，需要重新扫码登录。"
      }));
    }
    if (offlineAgeMs != null && offlineAgeMs > THIRTY_MIN_MS) {
      accountAlerts.push(mapMonitorAlert({
        code: "offline_30m",
        severity: "critical",
        waAccountId: account.waAccountId,
        title: `${account.displayName} 离线超过 30 分钟`,
        detail: "账号长时间离线，请检查会话和设备状态。"
      }));
    } else if (offlineAgeMs != null && offlineAgeMs > FIFTEEN_MIN_MS) {
      accountAlerts.push(mapMonitorAlert({
        code: "offline_15m",
        severity: "warning",
        waAccountId: account.waAccountId,
        title: `${account.displayName} 离线超过 15 分钟`,
        detail: "账号已离线超过 15 分钟，请尽快处理。"
      }));
    }
    if (metrics.unreadMessageCount > 50) {
      accountAlerts.push(mapMonitorAlert({
        code: "unread_over_50",
        severity: "warning",
        waAccountId: account.waAccountId,
        title: `${account.displayName} 未读消息超过 50 条`,
        detail: `当前未读消息 ${metrics.unreadMessageCount} 条。`
      }));
    }
    alerts.push(...accountAlerts);

    return {
      ...account,
      status: {
        code: monitorStatus,
        label:
          monitorStatus === "ready" ? "在线" :
            monitorStatus === "connecting" ? "连接中" :
              monitorStatus === "session_expired" ? "会话失效" : "离线",
        detail: account.status.detail,
        tone: accountAlerts.some((item) => item.severity === "critical")
          ? "danger"
          : (monitorStatus === "ready" ? "success" : monitorStatus === "connecting" ? "processing" : "default")
      },
      lastOnlineAt,
      conversationCount: metrics.conversationCount,
      unreadMessageCount: metrics.unreadMessageCount,
      unrepliedCount24h: 0,
      alerts: accountAlerts
    };
  });

  return {
    summary: {
      accountCount: accountItems.length,
      readyCount: accountItems.filter((item) => item.status.code === "ready").length,
      connectingCount: accountItems.filter((item) => item.status.code === "connecting").length,
      offlineCount: accountItems.filter((item) => item.status.code === "offline").length,
      criticalAlertCount: alerts.filter((item) => item.severity === "critical").length,
      warningAlertCount: alerts.filter((item) => item.severity === "warning").length
    },
    alerts,
    accounts: accountItems
  };
}

export async function listAdminWaMonitorConversations(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; search?: string | null; type?: string | null; limit?: number }
) {
  const rows = await listWaConversations(trx, {
    tenantId: input.tenantId,
    waAccountIds: [input.waAccountId],
    assignedToMembershipId: null,
    type: input.type ?? null
  });
  const term = input.search?.trim().toLowerCase() ?? "";
  const filtered = term
    ? rows.filter((item) => {
        const haystacks = [
          item.displayName,
          item.chatJid,
          item.contactName,
          item.contactPhoneE164,
          item.subject,
          item.lastMessagePreview
        ].filter(Boolean).map((value) => String(value).toLowerCase());
        return haystacks.some((value) => value.includes(term));
      })
    : rows;
  if (input.limit && Number.isFinite(input.limit)) {
    const limited = filtered.slice(0, Math.max(1, Math.min(input.limit, 500)));
    const targetRows = limited.length
      ? await trx("wa_monitor_targets")
          .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
          .whereIn("wa_conversation_id", limited.map((item) => item.waConversationId))
          .select("wa_conversation_id", "target_id", "is_active")
      : [];
    const targetMap = new Map(targetRows.map((row) => [String(row.wa_conversation_id), row]));
    return limited.map((item) => ({
      ...item,
      monitorTargetId: targetMap.get(item.waConversationId)?.target_id ? String(targetMap.get(item.waConversationId)?.target_id) : null,
      monitorEnabled: Boolean(targetMap.get(item.waConversationId)?.is_active)
    }));
  }
  const targetRows = filtered.length
    ? await trx("wa_monitor_targets")
        .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
        .whereIn("wa_conversation_id", filtered.map((item) => item.waConversationId))
        .select("wa_conversation_id", "target_id", "is_active")
    : [];
  const targetMap = new Map(targetRows.map((row) => [String(row.wa_conversation_id), row]));
  return filtered.map((item) => ({
    ...item,
    monitorTargetId: targetMap.get(item.waConversationId)?.target_id ? String(targetMap.get(item.waConversationId)?.target_id) : null,
    monitorEnabled: Boolean(targetMap.get(item.waConversationId)?.is_active)
  }));
}

export async function getAdminWaMonitorConversationDetail(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; limit?: number }
) {
  const conversation = await getWaConversationById(trx, input.tenantId, input.waConversationId);
  if (!conversation) throw new Error("Conversation not found");
  const limit = Math.min(input.limit ?? 50, 100);
  const [messages, members] = await Promise.all([
    getConversationMessages(trx, input.tenantId, input.waConversationId, limit),
    getConversationMembers(trx, input.tenantId, input.waConversationId)
  ]);
  const target = await trx("wa_monitor_targets")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .select("target_id", "is_active")
    .first<Record<string, unknown> | undefined>();
  return {
    conversation: {
      ...conversation,
      monitorTargetId: target?.target_id ? String(target.target_id) : null,
      monitorEnabled: Boolean(target?.is_active)
    },
    messages,
    members,
    hasMore: messages.length >= limit
  };
}

export async function loadMoreAdminWaMonitorMessages(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; beforeLogicalSeq: number; limit?: number }
) {
  const limit = Math.min(input.limit ?? 50, 100);
  const messages = await getConversationMessages(trx, input.tenantId, input.waConversationId, limit, input.beforeLogicalSeq);
  return {
    messages,
    hasMore: messages.length >= limit
  };
}

export async function listAdminWaMonitorAccountReport(
  trx: Knex.Transaction,
  input: WaMonitorReportQuery
) {
  const { page, pageSize, offset } = normalizePagination(input);
  const messageTs = buildMessageTimestampSql("m");

  const targetBase = trx("wa_monitor_targets")
    .where({ tenant_id: input.tenantId, is_active: true })
    .modify((qb) => {
      if (input.waAccountId) qb.where("wa_account_id", input.waAccountId);
    });

  const totalRow = await targetBase.clone()
    .countDistinct<{ total: string }>("wa_account_id as total")
    .first();

  const targetRows = await targetBase.clone()
    .select("wa_account_id")
    .countDistinct("wa_conversation_id as monitored_conversation_count")
    .groupBy("wa_account_id")
    .orderBy("wa_account_id", "asc")
    .limit(pageSize)
    .offset(offset);

  const accountIds = targetRows.map((row) => String(row.wa_account_id));
  const [accounts, messageRows, factRows] = await Promise.all([
    listWaAccounts(trx, input.tenantId),
    accountIds.length === 0
      ? []
      : trx("wa_messages as m")
          .join("wa_monitor_targets as t", function joinTarget() {
            this.on("t.wa_conversation_id", "=", "m.wa_conversation_id").andOn("t.tenant_id", "=", "m.tenant_id");
          })
          .where("m.tenant_id", input.tenantId)
          .where("t.is_active", true)
          .whereIn("m.wa_account_id", accountIds)
          .whereRaw(`${messageTs} >= ? and ${messageTs} <= ?`, [input.startAt, input.endAt])
          .select(
            "m.wa_account_id",
            trx.raw("count(*)::int as total_messages"),
            trx.raw("count(*) filter (where m.direction = 'inbound')::int as customer_message_count"),
            trx.raw("count(*) filter (where m.direction = 'outbound' and m.sender_member_id is not null)::int as service_message_count")
          )
          .groupBy("m.wa_account_id"),
    accountIds.length === 0
      ? []
      : trx("wa_conversation_reply_facts")
          .where("tenant_id", input.tenantId)
          .where("requires_reply", true)
          .whereIn("wa_account_id", accountIds)
          .where("customer_message_at", ">=", input.startAt)
          .where("customer_message_at", "<=", input.endAt)
          .select(
            "wa_account_id",
            trx.raw("count(*)::int as requires_reply_count"),
            trx.raw("count(*) filter (where first_reply_at is not null)::int as replied_count"),
            trx.raw("count(*) filter (where first_reply_at is null)::int as unreplied_count"),
            trx.raw("round(avg(reply_duration_sec))::int as average_response_seconds")
          )
          .groupBy("wa_account_id")
  ]);

  const accountMap = new Map(accounts.map((item) => [item.waAccountId, item]));
  const messageMap = new Map((messageRows as Array<Record<string, unknown>>).map((row) => [String(row.wa_account_id), row]));
  const factMap = new Map((factRows as Array<Record<string, unknown>>).map((row) => [String(row.wa_account_id), row]));
  return mapPagedResult({
    page,
    pageSize,
    total: Number(totalRow?.total ?? 0),
    rows: targetRows.map((row) => {
      const waAccountId = String(row.wa_account_id);
      const messageRow = messageMap.get(waAccountId);
      const factRow = factMap.get(waAccountId);
      return {
        waAccountId,
        accountDisplayName: accountMap.get(waAccountId)?.displayName ?? waAccountId,
        monitoredConversationCount: Number(row.monitored_conversation_count ?? 0),
        totalMessages: Number(messageRow?.total_messages ?? 0),
        customerMessageCount: Number(messageRow?.customer_message_count ?? 0),
        serviceMessageCount: Number(messageRow?.service_message_count ?? 0),
        requiresReplyCount: Number(factRow?.requires_reply_count ?? 0),
        repliedCount: Number(factRow?.replied_count ?? 0),
        unrepliedCount: Number(factRow?.unreplied_count ?? 0),
        averageResponseSeconds: factRow?.average_response_seconds == null ? null : Number(factRow.average_response_seconds)
      };
    })
  });
}

export async function listAdminWaMonitorMemberReport(
  trx: Knex.Transaction,
  input: WaMonitorReportQuery
) {
  const { page, pageSize, offset } = normalizePagination(input);
  const base = trx("wa_conversation_reply_facts as f")
    .where("f.tenant_id", input.tenantId)
    .where("f.requires_reply", true)
    .whereNotNull("f.first_reply_at")
    .where("f.customer_message_at", ">=", input.startAt)
    .where("f.customer_message_at", "<=", input.endAt)
    .modify((qb) => {
      if (input.waAccountId) qb.where("f.wa_account_id", input.waAccountId);
      if (input.membershipId) qb.where("f.replied_by_membership_id", input.membershipId);
    });

  const totalRow = await trx.from(base.clone().clearSelect().select("f.replied_by_membership_id").groupBy("f.replied_by_membership_id").as("member_report_groups"))
    .count<{ total: string }>("replied_by_membership_id as total")
    .first();

  const rows = await base
    .clone()
    .leftJoin("tenant_memberships as tm", function joinMembership() {
      this.on("tm.membership_id", "=", "f.replied_by_membership_id").andOn("tm.tenant_id", "=", "f.tenant_id");
    })
    .select(
      "f.replied_by_membership_id",
      "tm.display_name",
      trx.raw("count(*)::int as first_reply_count"),
      trx.raw("round(avg(f.reply_duration_sec))::int as average_first_reply_seconds"),
      trx.raw("count(distinct f.wa_conversation_id)::int as participated_conversation_count")
    )
    .groupBy("f.replied_by_membership_id", "tm.display_name")
    .orderBy("first_reply_count", "desc")
    .limit(pageSize)
    .offset(offset);

  return mapPagedResult({
    page,
    pageSize,
    total: Number(totalRow?.total ?? 0),
    rows: rows.map((row) => ({
      membershipId: row.replied_by_membership_id ? String(row.replied_by_membership_id) : null,
      displayName: row.display_name ? String(row.display_name) : null,
      replyMessageCount: Number(row.first_reply_count ?? 0),
      firstReplyCount: Number(row.first_reply_count ?? 0),
      averageFirstReplySeconds: row.average_first_reply_seconds == null ? null : Number(row.average_first_reply_seconds),
      participatedConversationCount: Number(row.participated_conversation_count ?? 0)
    }))
  });
}

export async function listAdminWaMonitorTimeReport(
  trx: Knex.Transaction,
  input: WaMonitorReportQuery & { granularity?: "hour" | "day" }
) {
  const { page, pageSize, offset } = normalizePagination(input);
  const granularity = input.granularity === "day" ? "day" : "hour";
  const messageTs = buildMessageTimestampSql("m");
  const messageBucket = `date_trunc('${granularity}', ${messageTs})`;
  const factBucket = `date_trunc('${granularity}', f.customer_message_at)`;

  const messageRows = await trx("wa_messages as m")
    .join("wa_monitor_targets as t", function joinTarget() {
      this.on("t.wa_conversation_id", "=", "m.wa_conversation_id").andOn("t.tenant_id", "=", "m.tenant_id");
    })
    .where("m.tenant_id", input.tenantId)
    .where("t.is_active", true)
    .whereRaw(`${messageTs} >= ? and ${messageTs} <= ?`, [input.startAt, input.endAt])
    .modify((qb) => {
      if (input.waAccountId) qb.where("m.wa_account_id", input.waAccountId);
      if (input.membershipId) qb.where("m.sender_member_id", input.membershipId);
    })
    .select(
      trx.raw(`${messageBucket} as bucket_at`),
      trx.raw("count(*)::int as total_messages"),
      trx.raw("count(*) filter (where m.direction = 'inbound')::int as customer_message_count"),
      trx.raw("count(*) filter (where m.direction = 'outbound' and m.sender_member_id is not null)::int as service_message_count")
    )
    .groupByRaw(messageBucket);

  const factRows = await trx("wa_conversation_reply_facts as f")
    .where("f.tenant_id", input.tenantId)
    .where("f.requires_reply", true)
    .where("f.customer_message_at", ">=", input.startAt)
    .where("f.customer_message_at", "<=", input.endAt)
    .modify((qb) => {
      if (input.waAccountId) qb.where("f.wa_account_id", input.waAccountId);
      if (input.membershipId) qb.where("f.replied_by_membership_id", input.membershipId);
    })
    .select(
      trx.raw(`${factBucket} as bucket_at`),
      trx.raw("count(*)::int as requires_reply_count"),
      trx.raw("count(*) filter (where f.first_reply_at is not null)::int as replied_count"),
      trx.raw("count(*) filter (where f.first_reply_at is null)::int as unreplied_count"),
      trx.raw("round(avg(f.reply_duration_sec))::int as average_response_seconds")
    )
    .groupByRaw(factBucket);

  const map = new Map<string, Record<string, unknown>>();
  for (const row of messageRows as Array<Record<string, unknown>>) {
    const key = new Date(String(row.bucket_at)).toISOString();
    map.set(key, { bucketAt: key, ...row });
  }
  for (const row of factRows as Array<Record<string, unknown>>) {
    const key = new Date(String(row.bucket_at)).toISOString();
    map.set(key, { ...(map.get(key) ?? { bucketAt: key }), ...row });
  }
  const allRows = Array.from(map.values())
    .sort((a, b) => new Date(String(a.bucketAt)).getTime() - new Date(String(b.bucketAt)).getTime())
    .map((row) => ({
      bucketAt: String(row.bucketAt),
      totalMessages: Number(row.total_messages ?? 0),
      customerMessageCount: Number(row.customer_message_count ?? 0),
      serviceMessageCount: Number(row.service_message_count ?? 0),
      requiresReplyCount: Number(row.requires_reply_count ?? 0),
      repliedCount: Number(row.replied_count ?? 0),
      unrepliedCount: Number(row.unreplied_count ?? 0),
      averageResponseSeconds: row.average_response_seconds == null ? null : Number(row.average_response_seconds)
    }));

  return mapPagedResult({
    page,
    pageSize,
    total: allRows.length,
    rows: allRows.slice(offset, offset + pageSize)
  });
}

export async function listAdminWaMonitorUnrepliedReport(
  trx: Knex.Transaction,
  input: WaMonitorReportQuery
) {
  const { page, pageSize, offset } = normalizePagination(input);
  const base = trx("wa_conversation_reply_facts as f")
    .where("f.tenant_id", input.tenantId)
    .where("f.requires_reply", true)
    .whereNull("f.first_reply_at")
    .where("f.customer_message_at", ">=", input.startAt)
    .where("f.customer_message_at", "<=", input.endAt)
    .modify((qb) => {
      if (input.waAccountId) qb.where("f.wa_account_id", input.waAccountId);
    });
  const totalRow = await base.clone().count<{ total: string }>("f.fact_id as total").first();
  const accounts = await listWaAccounts(trx, input.tenantId);
  const accountMap = new Map(accounts.map((item) => [item.waAccountId, item]));
  const rows = await base
    .clone()
    .join("wa_conversations as c", function joinConversation() {
      this.on("c.wa_conversation_id", "=", "f.wa_conversation_id").andOn("c.tenant_id", "=", "f.tenant_id");
    })
    .join("wa_messages as m", function joinMessage() {
      this.on("m.wa_message_id", "=", "f.source_wa_message_id").andOn("m.tenant_id", "=", "f.tenant_id");
    })
    .select("f.fact_id", "f.wa_account_id", "f.wa_conversation_id", "f.customer_message_at", "m.body_text", "c.chat_jid", "c.subject", "c.contact_name", "c.contact_phone_e164", "c.conversation_type", "c.unread_count")
    .orderBy("f.customer_message_at", "asc")
    .limit(pageSize)
    .offset(offset);

  return mapPagedResult({
    page,
    pageSize,
    total: Number(totalRow?.total ?? 0),
    rows: rows.map((row) => {
      const customerAt = new Date(String(row.customer_message_at));
      return {
        factId: String(row.fact_id),
        waAccountId: String(row.wa_account_id),
        accountDisplayName: accountMap.get(String(row.wa_account_id))?.displayName ?? String(row.wa_account_id),
        waConversationId: String(row.wa_conversation_id),
        displayName: row.subject ? String(row.subject) : (row.contact_name ? String(row.contact_name) : String(row.chat_jid)),
        chatJid: String(row.chat_jid),
        conversationType: String(row.conversation_type),
        customerMessageAt: customerAt.toISOString(),
        waitingSeconds: Math.max(0, Math.round((Date.now() - customerAt.getTime()) / 1000)),
        unreadCount: Number(row.unread_count ?? 0),
        lastMessagePreview: row.body_text ? String(row.body_text) : ""
      };
    })
  });
}

export async function listAdminWaMonitorMessageDetailReport(
  trx: Knex.Transaction,
  input: WaMonitorReportQuery
) {
  const { page, pageSize, offset } = normalizePagination(input);
  const base = trx("wa_message_monitor_analysis as a")
    .join("wa_messages as m", function joinMessage() {
      this.on("m.wa_message_id", "=", "a.wa_message_id").andOn("m.tenant_id", "=", "a.tenant_id");
    })
    .join("wa_conversations as c", function joinConversation() {
      this.on("c.wa_conversation_id", "=", "a.wa_conversation_id").andOn("c.tenant_id", "=", "a.tenant_id");
    })
    .leftJoin("wa_conversation_reply_facts as f", function joinFact() {
      this.on("f.source_wa_message_id", "=", "a.wa_message_id").andOn("f.tenant_id", "=", "a.tenant_id");
    })
    .where("a.tenant_id", input.tenantId)
    .where("f.customer_message_at", ">=", input.startAt)
    .where("f.customer_message_at", "<=", input.endAt)
    .modify((qb) => {
      if (input.waAccountId) qb.where("a.wa_account_id", input.waAccountId);
      if (input.membershipId) qb.where("f.replied_by_membership_id", input.membershipId);
      if (input.requiresReply != null) qb.where("a.requires_reply", input.requiresReply);
      if (input.isReplied === true) qb.whereNotNull("f.first_reply_at");
      if (input.isReplied === false) qb.whereNull("f.first_reply_at");
    });

  const totalRow = await base.clone().count<{ total: string }>("a.analysis_id as total").first();
  const accounts = await listWaAccounts(trx, input.tenantId);
  const accountMap = new Map(accounts.map((item) => [item.waAccountId, item]));
  const rows = await base
    .clone()
    .leftJoin("tenant_memberships as tm", function joinMembership() {
      this.on("tm.membership_id", "=", "f.replied_by_membership_id").andOn("tm.tenant_id", "=", "f.tenant_id");
    })
    .leftJoin("wa_messages as reply", function joinReply() {
      this.on("reply.wa_message_id", "=", "f.first_reply_wa_message_id").andOn("reply.tenant_id", "=", "f.tenant_id");
    })
    .select(
      "a.analysis_id",
      "a.wa_account_id",
      "a.wa_conversation_id",
      "a.wa_message_id",
      "a.requires_reply",
      "a.reason",
      "a.confidence",
      "a.model_provider",
      "a.model_name",
      "m.body_text",
      "m.message_type",
      "m.sender_jid",
      "m.participant_jid",
      "m.logical_seq",
      "m.provider_payload",
      "c.chat_jid",
      "c.subject",
      "c.contact_name",
      "c.contact_phone_e164",
      "c.conversation_type",
      "f.customer_message_at",
      "f.first_reply_at",
      "f.reply_duration_sec",
      "f.replied_by_membership_id",
      "tm.display_name as replied_by_name",
      "reply.body_text as first_reply_text"
    )
    .orderBy("f.customer_message_at", "desc")
    .limit(pageSize)
    .offset(offset);

  const conversationIds = Array.from(new Set(rows.map((row) => String(row.wa_conversation_id))));
  const participantJids = Array.from(new Set(rows.flatMap((row) => [
    asString(row.participant_jid),
    asString(row.sender_jid)
  ]).filter(Boolean) as string[]));
  const [memberRows, contactRows] = await Promise.all([
    conversationIds.length && participantJids.length
      ? trx("wa_conversation_members")
          .where("tenant_id", input.tenantId)
          .whereIn("wa_conversation_id", conversationIds)
          .whereIn("participant_jid", participantJids)
          .select("wa_conversation_id", "participant_jid", "display_name")
      : [],
    participantJids.length
      ? trx("wa_contacts")
          .where("tenant_id", input.tenantId)
          .whereIn("contact_jid", participantJids)
          .select("wa_account_id", "contact_jid", "phone_e164", "display_name", "notify_name", "verified_name")
      : []
  ]);
  const memberNameMap = new Map((memberRows as Array<Record<string, unknown>>).map((row) => [
    `${String(row.wa_conversation_id)}:${String(row.participant_jid)}`,
    asString(row.display_name)
  ]));
  const contactMap = new Map((contactRows as Array<Record<string, unknown>>).map((row) => [
    `${String(row.wa_account_id)}:${String(row.contact_jid)}`,
    {
      phoneE164: asString(row.phone_e164),
      displayName: asString(row.display_name) ?? asString(row.notify_name) ?? asString(row.verified_name)
    }
  ]));

  const contextByMessageId = new Map<string, Array<{
    waMessageId: string;
    direction: string;
    bodyText: string;
    messageType: string;
    senderName: string | null;
    senderJid: string | null;
    messageAt: string | null;
  }>>();
  const rowsByConversation = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const conversationId = String(row.wa_conversation_id);
    rowsByConversation.set(conversationId, [...(rowsByConversation.get(conversationId) ?? []), row]);
  }
  for (const [conversationId, conversationRows] of rowsByConversation) {
    const seqs = conversationRows.map((row) => Number(row.logical_seq)).filter(Number.isFinite);
    if (seqs.length === 0) continue;
    const minSeq = Math.max(0, Math.min(...seqs) - 3);
    const maxSeq = Math.max(...seqs) + 3;
    const contextRows = await trx("wa_messages as cm")
      .where("cm.tenant_id", input.tenantId)
      .where("cm.wa_conversation_id", conversationId)
      .whereBetween("cm.logical_seq", [minSeq, maxSeq])
      .select(
        "cm.wa_message_id",
        "cm.direction",
        "cm.body_text",
        "cm.message_type",
        "cm.sender_jid",
        "cm.participant_jid",
        "cm.provider_ts",
        "cm.created_at",
        "cm.provider_payload",
        "cm.logical_seq"
      )
      .orderBy("cm.logical_seq", "asc");
    for (const sourceRow of conversationRows) {
      const sourceSeq = Number(sourceRow.logical_seq);
      if (!Number.isFinite(sourceSeq)) continue;
      contextByMessageId.set(String(sourceRow.wa_message_id), contextRows
        .filter((contextRow) => {
          const seq = Number(contextRow.logical_seq);
          return Number.isFinite(seq) && seq >= Math.max(0, sourceSeq - 3) && seq <= sourceSeq + 3;
        })
        .map((contextRow) => {
          const contextSenderJid = asString(contextRow.participant_jid) ?? asString(contextRow.sender_jid);
          const contextContact = contextSenderJid ? contactMap.get(`${String(sourceRow.wa_account_id)}:${contextSenderJid}`) : null;
          const contextPhone = contextContact?.phoneE164 ?? derivePhoneE164FromJid(contextSenderJid);
          return {
            waMessageId: String(contextRow.wa_message_id),
            direction: String(contextRow.direction),
            bodyText: asString(contextRow.body_text) ?? "",
            messageType: String(contextRow.message_type),
            senderName: String(contextRow.direction) === "outbound"
              ? "客服"
              : (
                  (contextSenderJid ? memberNameMap.get(`${conversationId}:${contextSenderJid}`) : null) ??
                  contextContact?.displayName ??
                  extractPayloadPushName(contextRow.provider_payload) ??
                  contextPhone ??
                  contextSenderJid
                ),
            senderJid: contextSenderJid,
            messageAt: contextRow.provider_ts ? new Date(Number(contextRow.provider_ts)).toISOString() : toIso(contextRow.created_at as string | Date | null)
          };
        }));
    }
  }

  return mapPagedResult({
    page,
    pageSize,
    total: Number(totalRow?.total ?? 0),
    rows: rows.map((row) => {
      const senderJid = asString(row.participant_jid) ?? asString(row.sender_jid);
      const contact = senderJid ? contactMap.get(`${String(row.wa_account_id)}:${senderJid}`) : null;
      const senderPhoneE164 = contact?.phoneE164 ?? derivePhoneE164FromJid(senderJid);
      const senderDisplayName =
        (senderJid ? memberNameMap.get(`${String(row.wa_conversation_id)}:${senderJid}`) : null) ??
        contact?.displayName ??
        extractPayloadPushName(row.provider_payload) ??
        senderPhoneE164 ??
        senderJid;
      return {
        analysisId: String(row.analysis_id),
        waAccountId: String(row.wa_account_id),
        accountDisplayName: accountMap.get(String(row.wa_account_id))?.displayName ?? String(row.wa_account_id),
        waConversationId: String(row.wa_conversation_id),
        waMessageId: String(row.wa_message_id),
        displayName: row.subject ? String(row.subject) : (row.contact_name ? String(row.contact_name) : String(row.chat_jid)),
        chatJid: String(row.chat_jid),
        conversationType: String(row.conversation_type),
        customerMessageAt: row.customer_message_at ? new Date(String(row.customer_message_at)).toISOString() : null,
        senderJid,
        senderDisplayName,
        senderPhoneE164,
        messageType: String(row.message_type),
        bodyText: row.body_text ? String(row.body_text) : "",
        contextMessages: contextByMessageId.get(String(row.wa_message_id)) ?? [],
        requiresReply: Boolean(row.requires_reply),
        reason: row.reason ? String(row.reason) : "",
        confidence: Number(row.confidence ?? 0),
        isReplied: Boolean(row.first_reply_at),
        firstReplyAt: row.first_reply_at ? new Date(String(row.first_reply_at)).toISOString() : null,
        replyDurationSeconds: row.reply_duration_sec == null ? null : Number(row.reply_duration_sec),
        repliedByMembershipId: row.replied_by_membership_id ? String(row.replied_by_membership_id) : null,
        repliedByName: row.replied_by_name ? String(row.replied_by_name) : null,
        firstReplyText: row.first_reply_text ? String(row.first_reply_text) : "",
        modelProvider: String(row.model_provider),
        modelName: String(row.model_name)
      };
    })
  });
}

export async function getAdminWaDailyReport(
  trx: Knex.Transaction,
  input: { tenantId: string; date: string }
) {
  const { start, end } = toTimeRange(input.date);
  const messageTs = buildMessageTimestampSql("m");

  const [
    totals,
    replyTotals,
    accountMessageRows,
    accountFactRows,
    memberRows,
    unrepliedRows,
    monitorConversations,
    accounts
  ] = await Promise.all([
    trx("wa_messages as m")
      .join("wa_monitor_targets as t", function joinTarget() {
        this.on("t.wa_conversation_id", "=", "m.wa_conversation_id").andOn("t.tenant_id", "=", "m.tenant_id");
      })
      .where("m.tenant_id", input.tenantId)
      .where("t.is_active", true)
      .whereRaw(`${messageTs} >= ? and ${messageTs} < ?`, [start, end])
      .select(
        trx.raw("count(*)::int as total_messages"),
        trx.raw("count(*) filter (where m.direction = 'inbound')::int as customer_message_count"),
        trx.raw("count(*) filter (where m.direction = 'outbound' and m.sender_member_id is not null)::int as manual_reply_count")
      )
      .first<{ total_messages: number; manual_reply_count: number } | undefined>(),
    trx("wa_conversation_reply_facts")
      .where("tenant_id", input.tenantId)
      .where("requires_reply", true)
      .where("customer_message_at", ">=", start)
      .where("customer_message_at", "<", end)
      .select(
        trx.raw("count(*)::int as requires_reply_count"),
        trx.raw("count(*) filter (where first_reply_at is not null)::int as replied_count"),
        trx.raw("count(*) filter (where first_reply_at is null)::int as unreplied_count"),
        trx.raw("round(avg(reply_duration_sec))::int as average_response_seconds")
      )
      .first<Record<string, unknown> | undefined>(),
    trx("wa_monitor_targets as t")
      .leftJoin("wa_messages as m", function joinMessages() {
        this.on("m.wa_conversation_id", "=", "t.wa_conversation_id")
          .andOn("m.tenant_id", "=", "t.tenant_id")
          .andOn(trx.raw(`${messageTs} >= ?`, [start]))
          .andOn(trx.raw(`${messageTs} < ?`, [end]));
      })
      .where("t.tenant_id", input.tenantId)
      .where("t.is_active", true)
      .select(
        "t.wa_account_id",
        trx.raw("count(distinct t.wa_conversation_id)::int as monitored_conversation_count"),
        trx.raw("count(distinct m.wa_message_id)::int as total_messages"),
        trx.raw("count(distinct m.wa_message_id) filter (where m.direction = 'inbound')::int as customer_message_count"),
        trx.raw("count(distinct m.wa_message_id) filter (where m.direction = 'outbound' and m.sender_member_id is not null)::int as service_message_count")
      )
      .groupBy("t.wa_account_id"),
    trx("wa_conversation_reply_facts")
      .where("tenant_id", input.tenantId)
      .where("requires_reply", true)
      .where("customer_message_at", ">=", start)
      .where("customer_message_at", "<", end)
      .select(
        "wa_account_id",
        trx.raw("count(*)::int as requires_reply_count"),
        trx.raw("count(*) filter (where first_reply_at is not null)::int as replied_count"),
        trx.raw("count(*) filter (where first_reply_at is null)::int as unreplied_count"),
        trx.raw("round(avg(reply_duration_sec))::int as average_response_seconds")
      )
      .groupBy("wa_account_id"),
    trx("wa_conversation_reply_facts as f")
      .leftJoin("tenant_memberships as tm", function joinMembership() {
        this.on("tm.membership_id", "=", "f.replied_by_membership_id").andOn("tm.tenant_id", "=", "f.tenant_id");
      })
      .where("f.tenant_id", input.tenantId)
      .where("f.requires_reply", true)
      .whereNotNull("f.first_reply_at")
      .where("f.customer_message_at", ">=", start)
      .where("f.customer_message_at", "<", end)
      .select(
        "f.replied_by_membership_id",
        "tm.display_name",
        trx.raw("count(*)::int as first_reply_count"),
        trx.raw("round(avg(f.reply_duration_sec))::int as average_first_reply_seconds"),
        trx.raw("count(distinct f.wa_conversation_id)::int as participated_conversation_count")
      )
      .groupBy("f.replied_by_membership_id", "tm.display_name")
      .orderBy("first_reply_count", "desc"),
    trx("wa_conversation_reply_facts as f")
      .join("wa_conversations as c", function joinConversation() {
        this.on("c.wa_conversation_id", "=", "f.wa_conversation_id").andOn("c.tenant_id", "=", "f.tenant_id");
      })
      .join("wa_messages as m", function joinMessage() {
        this.on("m.wa_message_id", "=", "f.source_wa_message_id").andOn("m.tenant_id", "=", "f.tenant_id");
      })
      .where("f.tenant_id", input.tenantId)
      .where("f.requires_reply", true)
      .whereNull("f.first_reply_at")
      .where("f.customer_message_at", ">=", start)
      .where("f.customer_message_at", "<", end)
      .select("f.wa_account_id", "f.wa_conversation_id", "f.customer_message_at", "m.body_text", "c.chat_jid", "c.unread_count")
      .orderBy("f.customer_message_at", "asc")
      .limit(10),
    listWaConversations(trx, {
      tenantId: input.tenantId,
      waAccountIds: (await listWaAccounts(trx, input.tenantId)).map((item) => item.waAccountId),
      assignedToMembershipId: null,
      type: null
    }),
    listWaAccounts(trx, input.tenantId)
  ]);

  const conversationMap = new Map(monitorConversations.map((item) => [item.waConversationId, item]));
  const accountMap = new Map(accounts.map((item) => [item.waAccountId, item]));
  const accountFactMap = new Map((accountFactRows as Array<Record<string, unknown>>).map((row) => [String(row.wa_account_id), row]));
  const unrepliedTop10 = unrepliedRows
    .map((row) => {
      const conversation = conversationMap.get(String(row.wa_conversation_id));
      const inboundAt = new Date(String(row.customer_message_at));
      return {
        waConversationId: String(row.wa_conversation_id),
        waAccountId: String(row.wa_account_id),
        displayName: conversation?.displayName ?? String(row.chat_jid),
        chatJid: String(row.chat_jid),
        lastInboundAt: inboundAt.toISOString(),
        waitingSeconds: Math.max(0, Math.round((Date.now() - inboundAt.getTime()) / 1000)),
        unreadCount: Number(row.unread_count ?? 0),
        lastMessagePreview: row.body_text ? String(row.body_text) : ""
      };
    });

  return {
    date: input.date,
    summary: {
      totalMessages: Number(totals?.total_messages ?? 0),
      customerMessageCount: Number((totals as Record<string, unknown> | undefined)?.customer_message_count ?? 0),
      manualReplyCount: Number(totals?.manual_reply_count ?? 0),
      requiresReplyCount: Number(replyTotals?.requires_reply_count ?? 0),
      repliedCount: Number(replyTotals?.replied_count ?? 0),
      unrepliedCount: Number(replyTotals?.unreplied_count ?? 0),
      averageResponseSeconds: replyTotals?.average_response_seconds == null ? null : Number(replyTotals.average_response_seconds)
    },
    accountReports: (accountMessageRows as Array<Record<string, unknown>>).map((row) => {
      const factRow = accountFactMap.get(String(row.wa_account_id));
      return {
      waAccountId: String(row.wa_account_id),
      accountDisplayName: accountMap.get(String(row.wa_account_id))?.displayName ?? String(row.wa_account_id),
      monitoredConversationCount: Number(row.monitored_conversation_count ?? 0),
      totalMessages: Number(row.total_messages ?? 0),
      customerMessageCount: Number(row.customer_message_count ?? 0),
      serviceMessageCount: Number(row.service_message_count ?? 0),
      requiresReplyCount: Number(factRow?.requires_reply_count ?? 0),
      repliedCount: Number(factRow?.replied_count ?? 0),
      unrepliedCount: Number(factRow?.unreplied_count ?? 0),
      averageResponseSeconds: factRow?.average_response_seconds == null ? null : Number(factRow.average_response_seconds)
      };
    }),
    memberReports: memberRows.map((row) => ({
      membershipId: row.replied_by_membership_id ? String(row.replied_by_membership_id) : null,
      displayName: row.display_name ? String(row.display_name) : null,
      replyMessageCount: Number(row.first_reply_count ?? 0),
      firstReplyCount: Number(row.first_reply_count ?? 0),
      averageFirstReplySeconds: row.average_first_reply_seconds == null ? null : Number(row.average_first_reply_seconds),
      participatedConversationCount: Number(row.participated_conversation_count ?? 0)
    })),
    unrepliedTop10
  };
}

export async function listAdminWaReplyPool(
  trx: Knex.Transaction,
  input: { tenantId: string }
) {
  const accounts = await listWaAccounts(trx, input.tenantId);
  const accountIds = accounts.map((item) => item.waAccountId);
  const conversations = await listWaConversations(trx, {
    tenantId: input.tenantId,
    waAccountIds: accountIds,
    assignedToMembershipId: null,
    type: null
  });
  const conversationMap = new Map(conversations.map((item) => [item.waConversationId, item]));
  const rows = await trx("wa_conversation_reply_facts as f")
    .join("wa_messages as m", function joinMessage() {
      this.on("m.wa_message_id", "=", "f.source_wa_message_id").andOn("m.tenant_id", "=", "f.tenant_id");
    })
    .join("wa_conversations as c", function joinConversation() {
      this.on("c.wa_conversation_id", "=", "f.wa_conversation_id").andOn("c.tenant_id", "=", "f.tenant_id");
    })
    .where("f.tenant_id", input.tenantId)
    .where("f.requires_reply", true)
    .whereNull("f.first_reply_at")
    .whereIn("f.wa_account_id", accountIds)
    .select(
      "f.wa_account_id",
      "f.wa_conversation_id",
      "f.customer_message_at",
      "m.body_text",
      "c.chat_jid",
      "c.unread_count"
    )
    .orderBy("f.customer_message_at", "asc")
    .limit(200);

  return rows.map((row) => {
    const conversation = conversationMap.get(String(row.wa_conversation_id));
    const inboundAt = new Date(String(row.customer_message_at));
    return {
      taskType: "human_follow_up",
      taskId: null,
      waConversationId: String(row.wa_conversation_id),
      waAccountId: String(row.wa_account_id),
      accountDisplayName: accounts.find((item) => item.waAccountId === String(row.wa_account_id))?.displayName ?? String(row.wa_account_id),
      displayName: conversation?.displayName ?? String(row.chat_jid),
      chatJid: String(row.chat_jid),
      conversationType: conversation?.conversationType ?? "direct",
      unreadCount: Number(row.unread_count ?? 0),
      lastInboundAt: inboundAt.toISOString(),
      waitingSeconds: Math.max(0, Math.round((Date.now() - inboundAt.getTime()) / 1000)),
      lastMessagePreview: row.body_text ? String(row.body_text) : "",
      currentReplierMembershipId: conversation?.currentReplierMembershipId ?? null,
      currentReplierName: conversation?.currentReplierName ?? null
    };
  });
}
