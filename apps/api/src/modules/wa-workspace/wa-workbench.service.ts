/**
 * 作用:
 * - 承载 WA 工作台的核心业务编排。
 *
 * 交互:
 * - 读取账号可见范围、会话列表、消息详情。
 * - 调用接管服务控制发送权限，调用 repository 落出站消息与队列任务。
 */
import type { Knex } from "knex";

import { waProviderAdapter } from "./provider/provider-registry.js";
import { deriveWaActions, deriveWaStatus } from "./wa-session-status.js";
import { assertCanReplyToWaConversation, releaseWaConversation, takeOverWaConversation } from "./wa-assignment.service.js";
import {
  createWaLoginTask,
  getAccessibleWaAccountUnreadSummary,
  listAccessibleWaAccounts,
  upsertWaAccountSession
} from "./wa-account.repository.js";
import {
  getConversationMembers,
  getConversationMessages,
  getOrCreateDirectConversationForContact,
  getWaConversationById,
  insertWaMessage,
  insertWaMessageAttachment,
  insertWaMessageReaction,
  resetWaConversationUnread,
  listWaConversations,
  listWaContacts
} from "./wa-conversation.repository.js";
import { refreshWaConversationProjection } from "./wa-conversation-projection.service.js";
import {
  archiveBaileysConversation,
  deleteBaileysMessageForEveryone,
  deleteBaileysMessageForMe,
  editBaileysTextMessage
} from "./runtime/baileys-send.service.js";

async function assertConversationAccessible(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waConversationId: string }
) {
  const conversation = await trx("wa_conversations")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .select("wa_account_id")
    .first<Record<string, unknown> | undefined>();
  if (!conversation) throw new Error("Conversation not found");

  const accounts = await listWorkbenchAccounts(trx, {
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    role: input.role
  });
  if (!accounts.some((item) => item.waAccountId === String(conversation.wa_account_id))) {
    throw new Error("Conversation not accessible");
  }
}

async function getConversationRow(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string }
) {
  const conversation = await trx("wa_conversations")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .first<Record<string, unknown> | undefined>();
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

export async function listWorkbenchAccounts(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string }
) {
  return listAccessibleWaAccounts(trx, {
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    includeAllForAdmins: false
  });
}

export async function getWorkbenchSummary(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string }
) {
  return getAccessibleWaAccountUnreadSummary(trx, {
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    includeAllForAdmins: false
  });
}

export async function createWorkbenchLoginTask(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waAccountId: string }
) {
  const accounts = await listWorkbenchAccounts(trx, input);
  const account = accounts.find((item) => item.waAccountId === input.waAccountId);
  if (!account) {
    throw new Error("WA account not accessible");
  }
  const latestSession = await trx("wa_account_sessions")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .orderByRaw("coalesce(updated_at, heartbeat_at, created_at) desc, created_at desc")
    .first<Record<string, unknown> | undefined>();
  const forceFresh = String(latestSession?.disconnect_reason ?? "") === "401";
  const ticket = await waProviderAdapter.createLoginTicket({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    instanceKey: account.instanceKey,
    forceFresh
  });

  await upsertWaAccountSession(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    sessionRef: ticket.sessionRef,
    loginMode: "employee_scan",
    connectionState: ticket.connectionState,
    loginPhase: ticket.loginPhase,
    qrCode: ticket.qrCode
  });

  const row = await createWaLoginTask(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    requestedByMembershipId: input.membershipId,
    loginMode: "employee_scan",
    sessionRef: ticket.sessionRef,
    qrCode: ticket.qrCode,
    expiresAt: ticket.expiresAt
  });

  return {
    loginTaskId: String(row.login_task_id),
    sessionRef: String(row.session_ref),
    qrCode: row.qr_code ? String(row.qr_code) : null,
    loginPhase: ticket.loginPhase,
    connectionState: ticket.connectionState,
    ...(function buildStatus() {
      const session = {
        connectionState: ticket.connectionState,
        loginMode: "employee_scan",
        loginPhase: ticket.loginPhase,
        disconnectReason: null,
        qrCodeAvailable: Boolean(ticket.qrCode),
        historySyncedAt: null,
        chatsSyncedAt: null,
        groupsSyncedAt: null,
        hasGroupChats: null
      };
      const status = deriveWaStatus({
        accountStatus: String(account.accountStatus),
        session
      });
      return {
        status,
        actions: deriveWaActions({
          status,
          hasSession: true,
          lastConnectedAt: account.lastConnectedAt,
          session
        })
      };
    })(),
    expiresAt: new Date(String(row.expires_at)).toISOString()
  };
}

export async function listWorkbenchConversations(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string;
    role: string;
    accountId?: string | null;
    assignedToMe?: boolean;
    type?: string | null;
    archived?: boolean;
  }
) {
  const accounts = await listWorkbenchAccounts(trx, input);
  const waAccountIds = input.accountId ? accounts.filter((item) => item.waAccountId === input.accountId).map((item) => item.waAccountId) : accounts.map((item) => item.waAccountId);
  return listWaConversations(trx, {
    tenantId: input.tenantId,
    waAccountIds,
    assignedToMembershipId: input.assignedToMe ? input.membershipId : null,
    type: input.type ?? null,
    archived: input.archived ?? false
  });
}

async function getWaAccountInstanceKey(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string }
) {
  const account = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .select("instance_key")
    .first<Record<string, unknown> | undefined>();
  const instanceKey = account?.instance_key ? String(account.instance_key) : null;
  if (!instanceKey) throw new Error("WA account instance key not found");
  return instanceKey;
}

async function getLatestProviderMessageForConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string }
) {
  const row = await trx("wa_messages")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .whereNotNull("provider_message_id")
    .select("provider_message_id", "direction", "participant_jid")
    .orderByRaw("coalesce(provider_ts, (extract(epoch from created_at) * 1000)::bigint) desc")
    .first<Record<string, unknown> | undefined>();
  if (!row?.provider_message_id) return null;
  return {
    providerMessageId: String(row.provider_message_id),
    fromMe: String(row.direction) === "outbound",
    participantJid: row.participant_jid ? String(row.participant_jid) : null
  };
}

export async function archiveWorkbenchConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waConversationId: string; archive: boolean }
) {
  await assertConversationAccessible(trx, input);
  const conversation = await getConversationRow(trx, input);
  const instanceKey = await getWaAccountInstanceKey(trx, {
    tenantId: input.tenantId,
    waAccountId: String(conversation.wa_account_id)
  });
  const lastMessage = await getLatestProviderMessageForConversation(trx, input);

  await archiveBaileysConversation({
    tenantId: input.tenantId,
    waAccountId: String(conversation.wa_account_id),
    instanceKey,
    chatJid: String(conversation.chat_jid),
    archive: input.archive,
    lastMessage
  });

  await trx("wa_conversations")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .update({
      archived_at: input.archive ? trx.fn.now() : null,
      archived_by_membership_id: input.archive ? input.membershipId : null,
      updated_at: trx.fn.now()
    });
  await refreshWaConversationProjection(trx, {
    tenantId: input.tenantId,
    waAccountId: String(conversation.wa_account_id),
    waConversationId: input.waConversationId
  });
  return { archived: input.archive };
}

export async function getWorkbenchConversationDetail(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waConversationId: string }
) {
  let conversation = await getWaConversationById(trx, input.tenantId, input.waConversationId);
  if (!conversation) throw new Error("Conversation not found");
  await assertConversationAccessible(trx, input);

  if (conversation.unreadCount > 0) {
    const account = await trx("wa_accounts")
      .where({
        tenant_id: input.tenantId,
        wa_account_id: conversation.waAccountId
      })
      .select("instance_key")
      .first<Record<string, unknown> | undefined>();
    const latestKeyRow = await trx("wa_messages")
      .where({
        tenant_id: input.tenantId,
        wa_conversation_id: input.waConversationId
      })
      .whereNotNull("provider_message_id")
      .select("provider_payload")
      .orderByRaw("coalesce(provider_ts, (extract(epoch from created_at) * 1000)::bigint) desc")
      .first<Record<string, unknown> | undefined>();

    if (account?.instance_key && latestKeyRow?.provider_payload) {
      const payload = typeof latestKeyRow.provider_payload === "string"
        ? JSON.parse(String(latestKeyRow.provider_payload))
        : (latestKeyRow.provider_payload as Record<string, unknown>);
      const key = payload?.key && typeof payload.key === "object"
        ? (payload.key as Record<string, unknown>)
        : null;
      const remoteJid = typeof key?.remoteJid === "string" ? key.remoteJid : conversation.chatJid;
      const id = typeof key?.id === "string" ? key.id : null;
      if (id) {
        try {
          await waProviderAdapter.markConversationRead({
            tenantId: input.tenantId,
            waAccountId: conversation.waAccountId,
            instanceKey: String(account.instance_key),
            keys: [{
              remoteJid,
              id,
              participant: typeof key?.participant === "string" ? key.participant : null,
              fromMe: Boolean(key?.fromMe)
            }]
          });
        } catch (error) {
          console.warn("[wa-workbench] mark read failed", {
            tenantId: input.tenantId,
            waConversationId: input.waConversationId,
            error
          });
        }
      }
    }

    await resetWaConversationUnread(trx, {
      tenantId: input.tenantId,
      waAccountId: conversation.waAccountId,
      chatJid: conversation.chatJid
    });
    await refreshWaConversationProjection(trx, {
      tenantId: input.tenantId,
      waAccountId: conversation.waAccountId,
      waConversationId: input.waConversationId
    });
    conversation = await getWaConversationById(trx, input.tenantId, input.waConversationId);
  }

  const [messages, members] = await Promise.all([
    getConversationMessages(trx, input.tenantId, input.waConversationId),
    getConversationMembers(trx, input.tenantId, input.waConversationId)
  ]);
  return {
    conversation,
    messages,
    members,
    permissions: {
      canReply:
        !conversation.currentReplierMembershipId ||
        conversation.currentReplierMembershipId === input.membershipId,
      canForceAssign: ["tenant_admin", "admin", "supervisor"].includes(input.role)
    }
  };
}

export async function takeOverWorkbenchConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waConversationId: string; reason?: string | null; force?: boolean }
) {
  await assertConversationAccessible(trx, input);
  await takeOverWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    membershipId: input.membershipId,
    actedByMembershipId: input.membershipId,
    reason: input.reason ?? null,
    force: input.force
  });
  return { lockStatus: "active", activeMembershipId: input.membershipId };
}

export async function forceAssignWorkbenchConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waConversationId: string; targetMembershipId: string; reason?: string | null }
) {
  if (!["tenant_admin", "admin", "supervisor"].includes(input.role)) {
    throw new Error("Only admin or supervisor can force assign WA conversations");
  }
  await assertConversationAccessible(trx, input);
  await takeOverWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    membershipId: input.targetMembershipId,
    actedByMembershipId: input.membershipId,
    reason: input.reason ?? null,
    force: true
  });
  return { lockStatus: "forced_overridden", activeMembershipId: input.targetMembershipId };
}

export async function releaseWorkbenchConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waConversationId: string; reason?: string | null; force?: boolean }
) {
  await assertConversationAccessible(trx, input);
  await releaseWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    membershipId: input.membershipId,
    reason: input.reason ?? null,
    force: input.force
  });
  return { lockStatus: "released" };
}

export async function enqueueWorkbenchTextMessage(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string;
    role: string;
    waConversationId: string;
    clientMessageId: string;
    text: string;
    quotedMessageId?: string | null;
    mentionJids?: string[] | null;
  }
) {
  await assertConversationAccessible(trx, input);
  await assertCanReplyToWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    membershipId: input.membershipId
  });

  const conversation = await getConversationRow(trx, input);

  // Insert the message FIRST so the real waMessageId can be stored in the job payload.
  // This allows wa-startup to re-enqueue stuck jobs with a valid waMessageId.
  const message = await insertWaMessage(trx, {
    tenantId: input.tenantId,
    waAccountId: String(conversation.wa_account_id),
    waConversationId: input.waConversationId,
    direction: "outbound",
    senderMemberId: input.membershipId,
    senderRole: "employee",
    bodyText: input.text,
    messageType: "text",
    messageScene: "external_chat",
    quotedMessageId: input.quotedMessageId ?? null,
    deliveryStatus: "pending",
    providerPayload: { mentionJids: input.mentionJids ?? [] }
  });

  const [job] = await trx("wa_outbound_jobs")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: String(conversation.wa_account_id),
      wa_conversation_id: input.waConversationId,
      created_by_membership_id: input.membershipId,
      client_message_id: input.clientMessageId,
      job_type: "send_text",
      send_status: "queued",
      payload: JSON.stringify({
        text: input.text,
        quotedMessageId: input.quotedMessageId ?? null,
        mentionJids: input.mentionJids ?? null,
        waMessageId: String(message.wa_message_id)
      })
    })
    .returning("*");

  return {
    jobId: String(job.job_id),
    waMessageId: String(message.wa_message_id),
    queuePayload: {
      jobId: String(job.job_id),
      tenantId: input.tenantId,
      waAccountId: String(conversation.wa_account_id),
      waConversationId: input.waConversationId,
      waMessageId: String(message.wa_message_id),
      createdByMembershipId: input.membershipId,
      jobType: "send_text",
      text: input.text,
      quotedMessageId: input.quotedMessageId ?? null,
      mentionJids: input.mentionJids ?? null
    }
  };
}

export async function enqueueWorkbenchMediaMessage(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string;
    role: string;
    waConversationId: string;
    clientMessageId: string;
    mediaType: "image" | "video" | "audio" | "document";
    mimeType: string;
    fileName: string;
    mediaUrl: string;
    caption?: string | null;
    quotedMessageId?: string | null;
    mentionJids?: string[] | null;
  }
) {
  await assertConversationAccessible(trx, input);
  await assertCanReplyToWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    membershipId: input.membershipId
  });

  const conversation = await getConversationRow(trx, input);

  // Insert the message and attachment FIRST so waMessageId is available for the job payload.
  const message = await insertWaMessage(trx, {
    tenantId: input.tenantId,
    waAccountId: String(conversation.wa_account_id),
    waConversationId: input.waConversationId,
    direction: "outbound",
    senderMemberId: input.membershipId,
    senderRole: "employee",
    bodyText: input.caption ?? null,
    messageType: input.mediaType,
    messageScene: "external_chat",
    quotedMessageId: input.quotedMessageId ?? null,
    deliveryStatus: "pending",
    providerPayload: { mentionJids: input.mentionJids ?? [] }
  });

  await insertWaMessageAttachment(trx, {
    tenantId: input.tenantId,
    waMessageId: String(message.wa_message_id),
    attachmentType: input.mediaType,
    mimeType: input.mimeType,
    fileName: input.fileName,
    storageUrl: input.mediaUrl
  });

  const [job] = await trx("wa_outbound_jobs")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: String(conversation.wa_account_id),
      wa_conversation_id: input.waConversationId,
      created_by_membership_id: input.membershipId,
      client_message_id: input.clientMessageId,
      job_type: "send_media",
      send_status: "queued",
      payload: JSON.stringify({
        mediaType: input.mediaType,
        mimeType: input.mimeType,
        fileName: input.fileName,
        mediaUrl: input.mediaUrl,
        caption: input.caption ?? null,
        quotedMessageId: input.quotedMessageId ?? null,
        mentionJids: input.mentionJids ?? null,
        waMessageId: String(message.wa_message_id)
      })
    })
    .returning("*");

  return {
    jobId: String(job.job_id),
    waMessageId: String(message.wa_message_id),
    queuePayload: {
      jobId: String(job.job_id),
      tenantId: input.tenantId,
      waAccountId: String(conversation.wa_account_id),
      waConversationId: input.waConversationId,
      waMessageId: String(message.wa_message_id),
      createdByMembershipId: input.membershipId,
      jobType: "send_media" as const,
      text: input.caption ?? "",
      mediaType: input.mediaType,
      mimeType: input.mimeType,
      fileName: input.fileName,
      mediaUrl: input.mediaUrl,
      quotedMessageId: input.quotedMessageId ?? null,
      mentionJids: input.mentionJids ?? null
    }
  };
}

export async function enqueueWorkbenchReaction(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string;
    role: string;
    waConversationId: string;
    targetWaMessageId: string;
    emoji: string;
  }
) {
  await assertConversationAccessible(trx, input);
  await assertCanReplyToWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    membershipId: input.membershipId
  });

  const conversation = await getConversationRow(trx, input);

  const target = await trx("wa_messages")
    .where({ tenant_id: input.tenantId, wa_message_id: input.targetWaMessageId })
    .first<Record<string, unknown> | undefined>();
  if (!target) throw new Error("Target message not found");

  const [job] = await trx("wa_outbound_jobs")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: String(conversation.wa_account_id),
      wa_conversation_id: input.waConversationId,
      created_by_membership_id: input.membershipId,
      client_message_id: crypto.randomUUID(),
      job_type: "send_reaction",
      send_status: "queued",
      payload: JSON.stringify({
        emoji: input.emoji,
        reactionTargetId: String(target.provider_message_id ?? "")
      })
    })
    .returning("*");

  await insertWaMessageReaction(trx, {
    tenantId: input.tenantId,
    waMessageId: input.targetWaMessageId,
    actorMemberId: input.membershipId,
    emoji: input.emoji
  });

  return {
    jobId: String(job.job_id),
    queuePayload: {
      jobId: String(job.job_id),
      tenantId: input.tenantId,
      waAccountId: String(conversation.wa_account_id),
      waConversationId: input.waConversationId,
      waMessageId: input.targetWaMessageId,
      createdByMembershipId: input.membershipId,
      jobType: "send_reaction" as const,
      emoji: input.emoji,
      reactionTargetId: String(target.provider_message_id ?? ""),
      remoteJid: String(conversation.chat_jid)
    }
  };
}

export async function editWorkbenchMessage(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string;
    role: string;
    waMessageId: string;
    text: string;
    mentionJids?: string[] | null;
  }
) {
  const message = await trx("wa_messages as m")
    .join("wa_conversations as c", function joinConversation() {
      this.on("c.wa_conversation_id", "=", "m.wa_conversation_id").andOn("c.tenant_id", "=", "m.tenant_id");
    })
    .where({ "m.tenant_id": input.tenantId, "m.wa_message_id": input.waMessageId })
    .select(
      "m.*",
      "c.chat_jid",
      "c.wa_conversation_id",
      "c.wa_account_id"
    )
    .first<Record<string, unknown> | undefined>();
  if (!message) throw new Error("Message not found");
  await assertConversationAccessible(trx, {
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    role: input.role,
    waConversationId: String(message.wa_conversation_id)
  });
  await assertCanReplyToWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: String(message.wa_conversation_id),
    membershipId: input.membershipId
  });
  if (String(message.direction) !== "outbound" || String(message.message_type) !== "text") {
    throw new Error("Only outbound text messages can be edited");
  }
  const providerMessageId = message.provider_message_id ? String(message.provider_message_id) : null;
  if (!providerMessageId) throw new Error("Message has not been sent to WhatsApp yet");
  const instanceKey = await getWaAccountInstanceKey(trx, {
    tenantId: input.tenantId,
    waAccountId: String(message.wa_account_id)
  });

  await editBaileysTextMessage({
    tenantId: input.tenantId,
    waAccountId: String(message.wa_account_id),
    instanceKey,
    chatJid: String(message.chat_jid),
    providerMessageId,
    text: input.text,
    participantJid: message.participant_jid ? String(message.participant_jid) : null,
    mentionJids: input.mentionJids ?? null
  });

  await trx("wa_messages")
    .where({ tenant_id: input.tenantId, wa_message_id: input.waMessageId })
    .update({
      body_text: input.text,
      edited_at: trx.fn.now(),
      edited_by_membership_id: input.membershipId,
      provider_payload: JSON.stringify({
        ...(typeof message.provider_payload === "string" ? JSON.parse(message.provider_payload) : (message.provider_payload as Record<string, unknown> | null) ?? {}),
        editedByNuyChat: true,
        mentionJids: input.mentionJids ?? []
      }),
      updated_at: trx.fn.now()
    });
  await refreshWaConversationProjection(trx, {
    tenantId: input.tenantId,
    waAccountId: String(message.wa_account_id),
    waConversationId: String(message.wa_conversation_id)
  });
  return { edited: true };
}

export async function deleteWorkbenchMessage(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string;
    role: string;
    waMessageId: string;
    scope: "me" | "everyone";
  }
) {
  const message = await trx("wa_messages as m")
    .join("wa_conversations as c", function joinConversation() {
      this.on("c.wa_conversation_id", "=", "m.wa_conversation_id").andOn("c.tenant_id", "=", "m.tenant_id");
    })
    .where({ "m.tenant_id": input.tenantId, "m.wa_message_id": input.waMessageId })
    .select("m.*", "c.chat_jid", "c.wa_conversation_id", "c.wa_account_id")
    .first<Record<string, unknown> | undefined>();
  if (!message) throw new Error("Message not found");
  await assertConversationAccessible(trx, {
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    role: input.role,
    waConversationId: String(message.wa_conversation_id)
  });
  await assertCanReplyToWaConversation(trx, {
    tenantId: input.tenantId,
    waConversationId: String(message.wa_conversation_id),
    membershipId: input.membershipId
  });
  const providerMessageId = message.provider_message_id ? String(message.provider_message_id) : null;
  if (!providerMessageId) throw new Error("Message has not been sent to WhatsApp yet");
  const instanceKey = await getWaAccountInstanceKey(trx, {
    tenantId: input.tenantId,
    waAccountId: String(message.wa_account_id)
  });

  if (input.scope === "everyone") {
    if (String(message.direction) !== "outbound") {
      throw new Error("Only outbound messages can be deleted for everyone");
    }
    await deleteBaileysMessageForEveryone({
      tenantId: input.tenantId,
      waAccountId: String(message.wa_account_id),
      instanceKey,
      chatJid: String(message.chat_jid),
      providerMessageId,
      participantJid: message.participant_jid ? String(message.participant_jid) : null
    });
    await trx("wa_messages")
      .where({ tenant_id: input.tenantId, wa_message_id: input.waMessageId })
      .update({
        delivery_status: "revoked",
        body_text: null,
        revoked_at: trx.fn.now(),
        revoked_by_membership_id: input.membershipId,
        updated_at: trx.fn.now()
      });
  } else {
    await deleteBaileysMessageForMe({
      tenantId: input.tenantId,
      waAccountId: String(message.wa_account_id),
      instanceKey,
      chatJid: String(message.chat_jid),
      providerMessageId,
      fromMe: String(message.direction) === "outbound",
      participantJid: message.participant_jid ? String(message.participant_jid) : null,
      timestampMs: message.provider_ts ? Number(message.provider_ts) : null
    });
    await trx("wa_messages")
      .where({ tenant_id: input.tenantId, wa_message_id: input.waMessageId })
      .update({
        deleted_for_me_at: trx.fn.now(),
        deleted_for_me_by_membership_id: input.membershipId,
        updated_at: trx.fn.now()
      });
  }

  await refreshWaConversationProjection(trx, {
    tenantId: input.tenantId,
    waAccountId: String(message.wa_account_id),
    waConversationId: String(message.wa_conversation_id)
  });
  return { deleted: true, scope: input.scope };
}

export async function loadMoreWorkbenchMessages(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    membershipId: string;
    role: string;
    waConversationId: string;
    beforeLogicalSeq: number;
    limit?: number;
  }
) {
  await assertConversationAccessible(trx, input);
  const limit = Math.min(input.limit ?? 50, 100);
  const messages = await getConversationMessages(trx, input.tenantId, input.waConversationId, limit, input.beforeLogicalSeq);
  return {
    messages,
    hasMore: messages.length >= limit
  };
}

export async function listWorkbenchContacts(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waAccountId: string; search?: string | null }
) {
  // Verify the requesting member can access this WA account.
  const accounts = await listWorkbenchAccounts(trx, input);
  if (!accounts.some((item) => item.waAccountId === input.waAccountId)) {
    throw new Error("WA account not accessible");
  }
  return listWaContacts(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    search: input.search ?? null
  });
}

export async function openWorkbenchContactConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; role: string; waAccountId: string; contactId: string }
) {
  const accounts = await listWorkbenchAccounts(trx, input);
  if (!accounts.some((item) => item.waAccountId === input.waAccountId)) {
    throw new Error("WA account not accessible");
  }

  const contact = await trx("wa_contacts")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      contact_id: input.contactId
    })
    .first<Record<string, unknown> | undefined>();
  if (!contact) {
    throw new Error("Contact not found");
  }

  const conversation = await getOrCreateDirectConversationForContact(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    contactJid: String(contact.contact_jid),
    displayName:
      (contact.display_name ? String(contact.display_name) : null) ??
      (contact.notify_name ? String(contact.notify_name) : null),
    phoneE164: contact.phone_e164 ? String(contact.phone_e164) : null
  });

  await refreshWaConversationProjection(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    waConversationId: conversation.waConversationId
  });

  // Return full detail (conversation + messages + members + permissions)
  // so the frontend can populate the chat panel immediately on open.
  return getWorkbenchConversationDetail(trx, {
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    role: input.role,
    waConversationId: conversation.waConversationId
  });
}
