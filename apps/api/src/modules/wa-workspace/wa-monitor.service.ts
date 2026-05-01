import type { Knex } from "knex";

import { listWaAccounts } from "./wa-account.repository.js";
import {
  getConversationMembers,
  getConversationMessages,
  getWaConversationById,
  listWaConversations
} from "./wa-conversation.repository.js";

type AlertSeverity = "warning" | "critical";
type WaMonitorReportQuery = {
  tenantId: string;
  startAt: Date;
  endAt: Date;
  waAccountId?: string | null;
  membershipId?: string | null;
  page?: number;
  pageSize?: number;
};

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
      "m.body_text",
      "m.message_type",
      "c.conversation_type",
      trx.raw(`${messageTs} as message_at`)
    )
    .first<Record<string, unknown> | undefined>();
  if (!row) return { skipped: true };

  const direction = String(row.direction);
  const messageAt = new Date(String(row.message_at));
  if (direction === "inbound") {
    const analysis = analyzeRequiresReply({
      conversationType: String(row.conversation_type),
      bodyText: row.body_text ? String(row.body_text) : null,
      messageType: String(row.message_type)
    });

    await trx("wa_message_monitor_analysis")
      .insert({
        tenant_id: input.tenantId,
        wa_account_id: row.wa_account_id,
        wa_conversation_id: row.wa_conversation_id,
        wa_message_id: row.wa_message_id,
        requires_reply: analysis.requiresReply,
        reason: analysis.reason,
        confidence: analysis.confidence,
        model_provider: "heuristic",
        model_name: "wa-monitor-v1"
      })
      .onConflict(["tenant_id", "wa_message_id"])
      .merge({
        requires_reply: analysis.requiresReply,
        reason: analysis.reason,
        confidence: analysis.confidence,
        model_provider: "heuristic",
        model_name: "wa-monitor-v1"
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

    return { processed: true, requiresReply: analysis.requiresReply };
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

export async function backfillAdminWaMonitorFacts(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId?: string | null; limit?: number }
) {
  const limit = Math.max(1, Math.min(input.limit ?? 300, 1000));
  const rows = await trx("wa_messages as m")
    .join("wa_monitor_targets as t", function joinTarget() {
      this.on("t.wa_conversation_id", "=", "m.wa_conversation_id").andOn("t.tenant_id", "=", "m.tenant_id");
    })
    .leftJoin("wa_message_monitor_analysis as a", function joinAnalysis() {
      this.on("a.wa_message_id", "=", "m.wa_message_id").andOn("a.tenant_id", "=", "m.tenant_id");
    })
    .where("m.tenant_id", input.tenantId)
    .where("t.is_active", true)
    .where("m.direction", "inbound")
    .whereNull("a.analysis_id")
    .modify((qb) => {
      if (input.waAccountId) qb.where("m.wa_account_id", input.waAccountId);
    })
    .select("m.wa_message_id")
    .orderBy("m.created_at", "desc")
    .limit(limit);

  let processed = 0;
  for (const row of rows) {
    const result = await processWaMonitorMessage(trx, {
      tenantId: input.tenantId,
      waMessageId: String(row.wa_message_id)
    });
    if ("processed" in result) processed += 1;
  }

  return { scanned: rows.length, processed };
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

  return mapPagedResult({
    page,
    pageSize,
    total: Number(totalRow?.total ?? 0),
    rows: rows.map((row) => ({
      analysisId: String(row.analysis_id),
      waAccountId: String(row.wa_account_id),
      accountDisplayName: accountMap.get(String(row.wa_account_id))?.displayName ?? String(row.wa_account_id),
      waConversationId: String(row.wa_conversation_id),
      waMessageId: String(row.wa_message_id),
      displayName: row.subject ? String(row.subject) : (row.contact_name ? String(row.contact_name) : String(row.chat_jid)),
      chatJid: String(row.chat_jid),
      conversationType: String(row.conversation_type),
      customerMessageAt: row.customer_message_at ? new Date(String(row.customer_message_at)).toISOString() : null,
      senderJid: row.participant_jid ? String(row.participant_jid) : (row.sender_jid ? String(row.sender_jid) : null),
      messageType: String(row.message_type),
      bodyText: row.body_text ? String(row.body_text) : "",
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
    }))
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
