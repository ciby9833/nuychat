/**
 * 作用:
 * - 处理 Baileys 的群组、聊天元数据与历史同步事件。
 *
 * 交互:
 * - 被 runtime manager 在 `messaging-history.set` / `groups.update` /
 *   `group-participants.update` / `chats.update` 时调用。
 * - 为 reconcile 与工作台会话详情提供更完整的历史和群信息。
 */
import type { Chat, Contact, GroupMetadata, ParticipantAction, WAMessage } from "@whiskeysockets/baileys";
import type makeWASocket from "@whiskeysockets/baileys";

import { withTenantTransaction } from "../../infra/db/client.js";
import { emitWaAccountUpdated } from "./wa-realtime.service.js";
import { deriveWaStatus } from "./wa-session-status.js";
import { mapBaileysMessageToInbound } from "./runtime/baileys-message.mapper.js";
import { ingestSingleBaileysMessage } from "./wa-baileys-event.service.js";
import {
  findWaMessageByProviderId,
  patchWaConversationChatState,
  patchWaConversationContactProfile,
  patchWaConversationMemberProfile,
  upsertWaContact,
  upsertWaConversation,
  upsertWaConversationMember
} from "./wa-conversation.repository.js";
import { refreshWaConversationProjection } from "./wa-conversation-projection.service.js";

const groupMetadataRateLimitCooldowns = new Map<string, number>();

function isNonConversationJid(jid: string | null) {
  if (!jid) return true;
  return jid === "status@broadcast" || jid.endsWith("@newsletter");
}

async function applyContactProjection(
  trx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0],
  input: { tenantId: string; waAccountId: string; contact: Partial<Contact> }
) {
  const pnJid = input.contact.phoneNumber ? `${input.contact.phoneNumber}@s.whatsapp.net` : null;
  const chatKeys = [input.contact.id, input.contact.lid, pnJid]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (chatKeys.length === 0) return;

  const resolvedName = resolveContactName(input.contact);
  const resolvedPhone = normalizePhoneE164(asString(input.contact.phoneNumber));

  // Persist into wa_contacts using the same stable identity family our
  // conversations and group members use at runtime:
  // - prefer LID when present
  // - otherwise use PN JID
  // - fall back to Baileys contact.id only if it is already an individual JID
  const primaryJid =
    input.contact.lid ??
    pnJid ??
    (input.contact.id && !input.contact.id.endsWith("@g.us") ? input.contact.id : null);
  if (primaryJid) {
    await upsertWaContact(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      contactJid: primaryJid,
      aliasJids: chatKeys,
      phoneE164: resolvedPhone,
      displayName: resolvedName,
      notifyName: asString(input.contact.notify),
      verifiedName: asString(input.contact.verifiedName)
    });
  }

  const rows = await patchWaConversationContactProfile(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    chatKeys,
    contactName: resolvedName,
    contactPhoneE164: resolvedPhone
  });
  await patchWaConversationMemberProfile(trx, {
    tenantId: input.tenantId,
    participantKeys: chatKeys,
    displayName: resolvedName
  });
  for (const row of rows) {
    await refreshWaConversationProjection(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      waConversationId: row.waConversationId
    });
  }
}

async function applyGroupMetadataProjection(
  trx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0],
  input: { tenantId: string; waAccountId: string; group: Partial<GroupMetadata> }
) {
  if (!input.group.id || isNonConversationJid(input.group.id)) return;
  const conversation = await upsertWaConversation(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    chatJid: input.group.id,
    conversationType: "group",
    subject: typeof input.group.subject === "string" ? input.group.subject : undefined
  });

  for (const participant of input.group.participants ?? []) {
    if (!participant.id) continue;
    await upsertWaConversationMember(trx, {
      tenantId: input.tenantId,
      waConversationId: conversation.waConversationId,
      participantJid: participant.id,
      displayName: asString((participant as { name?: string | null }).name),
      isAdmin: participant.admin === "admin" || participant.admin === "superadmin"
    });
  }

  await refreshWaConversationProjection(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    waConversationId: conversation.waConversationId
  });
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
  if (!jid) return null;
  // Only individual WA JIDs (@s.whatsapp.net) carry a phone number.
  // Group JIDs (@g.us) and privacy-preserving LID JIDs (@lid) must not produce phone numbers.
  if (!jid.endsWith("@s.whatsapp.net")) return null;
  const local = jid.split("@")[0] ?? "";
  return /^[0-9]+$/.test(local) ? normalizePhoneE164(local) : null;
}

function isLidJid(jid: string | null) {
  return Boolean(jid?.endsWith("@lid"));
}

function isPnJid(jid: string | null) {
  return Boolean(jid?.endsWith("@s.whatsapp.net"));
}

function resolveDirectChatIdentity(chat: Partial<Chat>) {
  const id = asString(chat.id);
  const lidJid = asString((chat as Record<string, unknown>).lidJid);
  const pnJid = asString((chat as Record<string, unknown>).pnJid);
  const canonicalJid =
    isLidJid(id) ? id :
    isLidJid(lidJid) ? lidJid :
    id;
  const phoneJid =
    isPnJid(id) ? id :
    isPnJid(pnJid) ? pnJid :
    null;
  return {
    chatJid: canonicalJid,
    contactJid: canonicalJid,
    contactPhoneE164: derivePhoneE164FromJid(phoneJid)
  };
}

function resolveContactName(contact: Partial<Contact>) {
  return (
    asString(contact.name) ??
    asString(contact.notify) ??
    asString(contact.verifiedName) ??
    null
  );
}

async function updateSessionSyncMeta(
  trx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0],
  input: {
    tenantId: string;
    waAccountId: string;
    patch: Record<string, unknown>;
  }
) {
  const session = await trx("wa_account_sessions")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .orderByRaw("coalesce(updated_at, heartbeat_at, created_at) desc, created_at desc")
    .first<{ session_id: string } | undefined>();
  if (!session) return;

  await trx("wa_account_sessions")
    .where({ session_id: session.session_id })
    .update({
      session_meta: trx.raw("coalesce(session_meta, '{}'::jsonb) || ?::jsonb", [JSON.stringify(input.patch)]),
      updated_at: trx.fn.now()
    });

  const account = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .first<Record<string, unknown> | undefined>();
  const sessionRow = await trx("wa_account_sessions")
    .where({ session_id: session.session_id })
    .first<Record<string, unknown> | undefined>();
  if (!account || !sessionRow) return;

  const meta = typeof sessionRow.session_meta === "string"
    ? JSON.parse(String(sessionRow.session_meta))
    : (sessionRow.session_meta as Record<string, unknown> | null);
  const sessionSummary = {
    connectionState: String(sessionRow.connection_state ?? "idle"),
    loginMode: sessionRow.login_mode ? String(sessionRow.login_mode) : null,
    loginPhase: typeof meta?.loginPhase === "string" ? meta.loginPhase : null,
    disconnectReason: sessionRow.disconnect_reason ? String(sessionRow.disconnect_reason) : null,
    qrCodeAvailable: typeof meta?.qrCode === "string" && meta.qrCode.length > 0,
    heartbeatAt: sessionRow.heartbeat_at ? new Date(String(sessionRow.heartbeat_at)).toISOString() : null,
    historySyncedAt: typeof meta?.historySyncedAt === "string" ? meta.historySyncedAt : null,
    chatsSyncedAt: typeof meta?.chatsSyncedAt === "string" ? meta.chatsSyncedAt : null,
    groupsSyncedAt: typeof meta?.groupsSyncedAt === "string" ? meta.groupsSyncedAt : null,
    hasGroupChats: typeof meta?.hasGroupChats === "boolean" ? meta.hasGroupChats : null
  };
  const status = deriveWaStatus({
    accountStatus: String(account.account_status ?? "offline"),
    session: sessionSummary
  });
  emitWaAccountUpdated({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    status,
    connectionState: sessionSummary.connectionState,
    loginPhase: sessionSummary.loginPhase ?? "idle",
    sessionRef: sessionRow.session_ref ? String(sessionRow.session_ref) : null,
    heartbeatAt: sessionRow.heartbeat_at ? new Date(String(sessionRow.heartbeat_at)).toISOString() : null,
    qrCode: typeof meta?.qrCode === "string" ? meta.qrCode : null,
    disconnectReason: sessionSummary.disconnectReason,
    autoReconnectCount: Number(sessionRow.auto_reconnect_count ?? 0),
    isOnline: null,
    phoneConnected: null,
    receivedPendingNotifications: null
  });
}

export async function patchWaSessionSyncMeta(input: {
  tenantId: string;
  waAccountId: string;
  patch: Record<string, unknown>;
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    await updateSessionSyncMeta(trx, input);
    return { ok: true };
  });
}

export async function ingestBaileysHistorySet(input: {
  tenantId: string;
  waAccountId: string;
  messages: WAMessage[];
}) {
  const inserted = await withTenantTransaction(input.tenantId, async (trx) => {
    let count = 0;
    for (const message of input.messages) {
      try {
        const result = await trx.transaction(async (messageTrx) => {
          return ingestSingleBaileysMessage(messageTrx, {
            tenantId: input.tenantId,
            waAccountId: input.waAccountId,
            message,
            eventType: "MESSAGING_HISTORY_SET"
          });
        });
        if (result) {
          count += 1;
        }
      } catch (error) {
        const jid = message.key?.remoteJid ?? "unknown";
        console.warn(`[ingestBaileysHistorySet] skipping history message from jid=${jid}:`, error);
      }
    }

    await updateSessionSyncMeta(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      patch: {
        historySyncedAt: new Date().toISOString()
      }
    });
    return count;
  });

  return { ok: true, inserted };
}

export async function ingestBaileysGroupsUpdate(input: {
  tenantId: string;
  waAccountId: string;
  groups: Partial<GroupMetadata>[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const group of input.groups) {
      await applyGroupMetadataProjection(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        group
      });
    }
    await updateSessionSyncMeta(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      patch: {
        groupsSyncedAt: new Date().toISOString()
      }
    });
    return { ok: true, count: input.groups.length };
  });
}

export async function ingestBaileysGroupParticipantsUpdate(input: {
  tenantId: string;
  waAccountId: string;
  chatJid: string;
  participants: Array<{ id?: string | null } | string>;
  action: ParticipantAction;
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    if (isNonConversationJid(input.chatJid)) return { ok: true };
    const conversation = await upsertWaConversation(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chatJid: input.chatJid,
      conversationType: "group"
    });

    for (const participant of input.participants) {
      const participantJid = typeof participant === "string" ? participant : (participant.id ?? null);
      if (!participantJid) continue;
      await upsertWaConversationMember(trx, {
        tenantId: input.tenantId,
        waConversationId: conversation.waConversationId,
        participantJid,
        left: input.action === "remove",
        isAdmin: input.action === "promote" ? true : input.action === "demote" ? false : undefined
      });
    }
    return { ok: true };
  });
}

export async function ingestBaileysChatsUpdate(input: {
  tenantId: string;
  waAccountId: string;
  chats: Partial<Chat>[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    const hasGroupChats = input.chats.some((chat) => typeof chat.id === "string" && chat.id.endsWith("@g.us"));
    for (const chat of input.chats) {
      if (!chat.id) continue;
      const chatId = asString(chat.id);
      if (!chatId) continue;
      if (isNonConversationJid(chatId)) continue;
      const isGroup = chatId.endsWith("@g.us");
      const directIdentity = isGroup ? null : resolveDirectChatIdentity(chat);
      const conversation = await upsertWaConversation(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        chatJid: directIdentity?.chatJid ?? chatId,
        conversationType: isGroup ? "group" : "direct",
        subject: typeof chat.name === "string" && chat.name.trim() ? chat.name : undefined,
        contactJid: isGroup ? undefined : (directIdentity?.contactJid ?? chatId),
        contactName: isGroup ? undefined : (typeof chat.name === "string" && chat.name.trim() ? chat.name : undefined),
        contactPhoneE164: isGroup ? undefined : (directIdentity?.contactPhoneE164 ?? derivePhoneE164FromJid(chatId)),
        unreadCount: typeof chat.unreadCount === "number" ? chat.unreadCount : null,
        allowCreate: false
      });
      if (!conversation) {
        continue;
      }
      if (typeof chat.unreadCount === "number") {
        await patchWaConversationChatState(trx, {
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          chatJid: directIdentity?.chatJid ?? chatId,
          conversationType: conversation.conversationType,
          unreadCount: chat.unreadCount
        });
      }
      await refreshWaConversationProjection(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        waConversationId: conversation.waConversationId
      });
    }
    await updateSessionSyncMeta(trx, {
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      patch: {
        chatsSyncedAt: new Date().toISOString(),
        hasGroupChats
      }
    });
    return { ok: true, count: input.chats.length };
  });
}

export async function ingestBaileysContactsUpsert(input: {
  tenantId: string;
  waAccountId: string;
  contacts: Contact[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const contact of input.contacts) {
      await applyContactProjection(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        contact
      });
    }
    return { ok: true, count: input.contacts.length };
  });
}

export async function ingestBaileysContactsUpdate(input: {
  tenantId: string;
  waAccountId: string;
  contacts: Partial<Contact>[];
}) {
  return withTenantTransaction(input.tenantId, async (trx) => {
    for (const contact of input.contacts) {
      await applyContactProjection(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        contact
      });
    }
    return { ok: true, count: input.contacts.length };
  });
}

/**
 * 主动拉取所有已知群组的最新元数据（群名、成员列表、管理员）。
 * 在账号连接就绪（receivedPendingNotifications = true）后延迟调用，
 * 补偿初始 groups.update 事件可能漏掉的群信息。
 * 每个群之间插入 300ms 延迟，避免 WhatsApp 限频。
 */
export async function syncAllGroupsForAccount(
  socket: ReturnType<typeof makeWASocket>,
  tenantId: string,
  waAccountId: string
): Promise<void> {
  const accountKey = `${tenantId}:${waAccountId}`;
  const cooldownUntil = groupMetadataRateLimitCooldowns.get(accountKey) ?? 0;
  if (cooldownUntil > Date.now()) {
    console.info("[wa-sync] skip proactive group metadata sync during cooldown", {
      tenantId,
      waAccountId,
      retryAfterMs: cooldownUntil - Date.now()
    });
    return;
  }
  // Get all known group JIDs for this account from our DB
  const groupJids = await withTenantTransaction(tenantId, async (trx) => {
    const rows = await trx("wa_conversations")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId, conversation_type: "group" })
      .select("chat_jid");
    return rows.map((row) => String(row.chat_jid)).filter((jid) => jid.endsWith("@g.us"));
  });

  if (groupJids.length === 0) return;
  console.info("[wa-sync] proactive group metadata sync", { tenantId, waAccountId, count: groupJids.length });

  for (const jid of groupJids) {
    try {
      const metadata = await socket.groupMetadata(jid);
      await ingestBaileysGroupsUpdate({ tenantId, waAccountId, groups: [metadata] });
    } catch (error) {
      const maybeStatus = Number((error as { data?: unknown })?.data ?? (error as { output?: { statusCode?: unknown } })?.output?.statusCode ?? 0);
      if (maybeStatus === 429 || String(error).includes("rate-overlimit")) {
        const retryAfterMs = 15 * 60_000;
        groupMetadataRateLimitCooldowns.set(accountKey, Date.now() + retryAfterMs);
        console.warn("[wa-sync] groupMetadata rate-limited; entering cooldown", {
          tenantId,
          waAccountId,
          jid,
          retryAfterMs
        });
        break;
      }
      console.warn("[wa-sync] groupMetadata fetch failed for", jid, { error });
    }
    // Brief pause to avoid rate-limiting
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.info("[wa-sync] proactive group metadata sync complete", { tenantId, waAccountId });
}

/**
 * 批量获取并存储联系人和群的头像 URL。
 * 在后台异步运行，失败不影响主流程。
 * 仅拉取距上次更新超过 7 天的头像（避免频繁刷新）。
 */
export async function syncAvatarsForAccount(
  socket: ReturnType<typeof makeWASocket>,
  tenantId: string,
  waAccountId: string
): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Contacts with stale/missing avatars
  const contactJids = await withTenantTransaction(tenantId, async (trx) => {
    const rows = await trx("wa_contacts")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .andWhere((b) => {
        b.whereNull("avatar_fetched_at").orWhere("avatar_fetched_at", "<", sevenDaysAgo);
      })
      .select("contact_jid")
      .limit(50); // process at most 50 per sync cycle
    return rows.map((row) => String(row.contact_jid));
  });

  // Group conversations with stale/missing avatars
  const groupJids = await withTenantTransaction(tenantId, async (trx) => {
    const rows = await trx("wa_conversations")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId, conversation_type: "group" })
      .andWhere((b) => {
        b.whereNull("avatar_fetched_at").orWhere("avatar_fetched_at", "<", sevenDaysAgo);
      })
      .select("chat_jid", "wa_conversation_id")
      .limit(50);
    return rows.map((row) => ({ jid: String(row.chat_jid), convId: String(row.wa_conversation_id) }));
  });

  const allJids = [
    ...contactJids.map((jid) => ({ jid, type: "contact" as const })),
    ...groupJids.map(({ jid, convId }) => ({ jid, type: "group" as const, convId }))
  ];

  if (allJids.length === 0) return;
  console.info("[wa-sync] avatar sync started", { tenantId, waAccountId, count: allJids.length });

  for (const item of allJids) {
    try {
      const url = await socket.profilePictureUrl(item.jid, "image");
      if (item.type === "contact") {
        await withTenantTransaction(tenantId, async (trx) => {
          await trx("wa_contacts")
            .where({ tenant_id: tenantId, wa_account_id: waAccountId, contact_jid: item.jid })
            .update({ avatar_url: url, avatar_fetched_at: trx.fn.now(), updated_at: trx.fn.now() });
        });
      } else {
        await withTenantTransaction(tenantId, async (trx) => {
          await trx("wa_conversations")
            .where({ tenant_id: tenantId, wa_account_id: waAccountId, chat_jid: item.jid })
            .update({ avatar_url: url, avatar_fetched_at: trx.fn.now(), updated_at: trx.fn.now() });
        });
      }
    } catch {
      // profilePictureUrl throws when privacy settings block it — mark as attempted
      await withTenantTransaction(tenantId, async (trx) => {
        if (item.type === "contact") {
          await trx("wa_contacts")
            .where({ tenant_id: tenantId, wa_account_id: waAccountId, contact_jid: item.jid })
            .update({ avatar_fetched_at: trx.fn.now(), updated_at: trx.fn.now() });
        } else {
          await trx("wa_conversations")
            .where({ tenant_id: tenantId, wa_account_id: waAccountId, chat_jid: item.jid })
            .update({ avatar_fetched_at: trx.fn.now(), updated_at: trx.fn.now() });
        }
      });
    }
    // Rate limit: 500ms between each request
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.info("[wa-sync] avatar sync complete", { tenantId, waAccountId });
}
