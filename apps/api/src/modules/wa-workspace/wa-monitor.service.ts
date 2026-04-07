import type { Knex } from "knex";

import { listWaAccounts } from "./wa-account.repository.js";
import {
  getConversationMembers,
  getConversationMessages,
  getWaConversationById,
  listWaConversations
} from "./wa-conversation.repository.js";

type AlertSeverity = "warning" | "critical";

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
  const [accounts, aggregates] = await Promise.all([
    listWaAccounts(trx, tenantId),
    trx("wa_conversations")
      .where({ tenant_id: tenantId })
      .select("wa_account_id")
      .count<{ wa_account_id: string; conversation_count: string }[]>("wa_conversation_id as conversation_count")
      .sum<{ unread_count: string | null }>("unread_count as unread_count")
      .groupBy("wa_account_id"),
  ]);

  const aggregateMap = new Map(
    aggregates.map((row) => [
      String(row.wa_account_id),
      {
        conversationCount: Number((row as unknown as { conversation_count?: string }).conversation_count ?? 0),
        unreadMessageCount: Number((row as unknown as { unread_count?: string | null }).unread_count ?? 0)
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
    return filtered.slice(0, Math.max(1, Math.min(input.limit, 500)));
  }
  return filtered;
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
  return { conversation, messages, members, hasMore: messages.length >= limit };
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

export async function getAdminWaDailyReport(
  trx: Knex.Transaction,
  input: { tenantId: string; date: string }
) {
  const { start, end } = toTimeRange(input.date);
  const messageTs = buildMessageTimestampSql("m");
  const responseRows = await trx("wa_messages as m")
    .where("m.tenant_id", input.tenantId)
    .where("m.direction", "inbound")
    .whereRaw(`${messageTs} >= ? and ${messageTs} < ?`, [start, end])
    .select(
      trx.raw(`${messageTs} as inbound_at`),
      trx.raw(`(
        select ${buildMessageTimestampSql("m2")}
        from wa_messages m2
        where m2.tenant_id = m.tenant_id
          and m2.wa_conversation_id = m.wa_conversation_id
          and m2.direction = 'outbound'
          and m2.sender_member_id is not null
          and ${buildMessageTimestampSql("m2")} > ${messageTs}
        order by ${buildMessageTimestampSql("m2")} asc
        limit 1
      ) as first_human_reply_at`)
    );

  const responseSeconds = responseRows
    .map((row) => {
      const inboundAt = row.inbound_at ? new Date(String(row.inbound_at)).getTime() : NaN;
      const replyAt = row.first_human_reply_at ? new Date(String(row.first_human_reply_at)).getTime() : NaN;
      if (!Number.isFinite(inboundAt) || !Number.isFinite(replyAt) || replyAt <= inboundAt) return null;
      return Math.round((replyAt - inboundAt) / 1000);
    })
    .filter((value): value is number => value != null);

  const [totals, unrepliedRows, monitorConversations] = await Promise.all([
    trx("wa_messages as m")
      .where("m.tenant_id", input.tenantId)
      .whereRaw(`${messageTs} >= ? and ${messageTs} < ?`, [start, end])
      .select(
        trx.raw("count(*)::int as total_messages"),
        trx.raw("count(*) filter (where m.direction = 'outbound' and m.sender_member_id is not null)::int as manual_reply_count")
      )
      .first<{ total_messages: number; manual_reply_count: number } | undefined>(),
    listLatestHumanReplyGaps(trx, input.tenantId, { limit: 50 }),
    listWaConversations(trx, {
      tenantId: input.tenantId,
      waAccountIds: (await listWaAccounts(trx, input.tenantId)).map((item) => item.waAccountId),
      assignedToMembershipId: null,
      type: null
    })
  ]);

  const conversationMap = new Map(monitorConversations.map((item) => [item.waConversationId, item]));
  const unrepliedTop10 = unrepliedRows
    .filter((row) => {
      const inboundAt = row.inbound_at ? new Date(String(row.inbound_at)).getTime() : NaN;
      return Number.isFinite(inboundAt) && (Date.now() - inboundAt) <= DAY_MS;
    })
    .slice(0, 10)
    .map((row) => {
      const conversation = conversationMap.get(String(row.wa_conversation_id));
      const inboundAt = new Date(String(row.inbound_at));
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
      manualReplyCount: Number(totals?.manual_reply_count ?? 0),
      averageResponseSeconds: responseSeconds.length
        ? Math.round(responseSeconds.reduce((sum, item) => sum + item, 0) / responseSeconds.length)
        : null
    },
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
  const rows = await listLatestHumanReplyGaps(trx, input.tenantId, { waAccountIds: accountIds, limit: 200 });

  return rows.map((row) => {
    const conversation = conversationMap.get(String(row.wa_conversation_id));
    const inboundAt = new Date(String(row.inbound_at));
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
