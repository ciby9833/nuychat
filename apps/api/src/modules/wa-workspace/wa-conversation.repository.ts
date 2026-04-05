/**
 * 作用:
 * - 封装 WA 会话、消息、原始事件的数据库访问。
 *
 * 交互:
 * - 被 workbench、provider webhook 服务调用。
 * - 提供会话 upsert、消息插入、列表与详情查询能力。
 */
import type { Knex } from "knex";

function mapConversation(row: Record<string, unknown>) {
  return {
    waConversationId: String(row.wa_conversation_id),
    waAccountId: String(row.wa_account_id),
    chatJid: String(row.chat_jid),
    conversationType: String(row.conversation_type),
    subject: row.subject ? String(row.subject) : null,
    contactJid: row.contact_jid ? String(row.contact_jid) : null,
    conversationStatus: String(row.conversation_status),
    currentReplierMembershipId: row.current_replier_membership_id ? String(row.current_replier_membership_id) : null,
    lastMessageAt: row.last_message_at ? new Date(String(row.last_message_at)).toISOString() : null,
    lastMessagePreview: row.last_message_preview ? String(row.last_message_preview) : null
  };
}

export async function getWaConversationById(trx: Knex.Transaction, tenantId: string, waConversationId: string) {
  const row = await trx("wa_conversations")
    .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
    .first<Record<string, unknown> | undefined>();
  return row ? mapConversation(row) : null;
}

export async function listWaConversations(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountIds: string[]; assignedToMembershipId?: string | null; type?: string | null }
) {
  if (input.waAccountIds.length === 0) return [];
  const query = trx("wa_conversations as c")
    .where("c.tenant_id", input.tenantId)
    .whereIn("c.wa_account_id", input.waAccountIds)
    .select("c.*");

  if (input.assignedToMembershipId) {
    query.andWhere("c.current_replier_membership_id", input.assignedToMembershipId);
  }
  if (input.type) {
    query.andWhere("c.conversation_type", input.type);
  }

  const rows = await query.orderBy("c.last_message_at", "desc").orderBy("c.created_at", "desc");
  const conversationIds = rows.map((row) => String(row.wa_conversation_id));
  const messageRows = conversationIds.length === 0
    ? []
    : await trx("wa_messages")
        .where("tenant_id", input.tenantId)
        .whereIn("wa_conversation_id", conversationIds)
        .select("wa_conversation_id", "body_text", "logical_seq")
        .orderBy("wa_conversation_id", "asc")
        .orderBy("logical_seq", "desc");

  const previewByConversation = new Map<string, string>();
  for (const row of messageRows) {
    const waConversationId = String(row.wa_conversation_id);
    if (previewByConversation.has(waConversationId)) continue;
    previewByConversation.set(waConversationId, String(row.body_text ?? ""));
  }

  return rows.map((row) => ({
    ...mapConversation(row as Record<string, unknown>),
    lastMessagePreview: previewByConversation.get(String(row.wa_conversation_id)) ?? null
  }));
}

export async function getConversationMessages(
  trx: Knex.Transaction,
  tenantId: string,
  waConversationId: string,
  limit = 100
) {
  const rows = await trx("wa_messages")
    .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
    .orderBy("logical_seq", "asc")
    .limit(limit);

  return rows.map((row) => ({
    waMessageId: String(row.wa_message_id),
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
    direction: String(row.direction),
    messageType: String(row.message_type),
    messageScene: String(row.message_scene),
    senderJid: row.sender_jid ? String(row.sender_jid) : null,
    senderMemberId: row.sender_member_id ? String(row.sender_member_id) : null,
    senderRole: String(row.sender_role),
    participantJid: row.participant_jid ? String(row.participant_jid) : null,
    quotedMessageId: row.quoted_message_id ? String(row.quoted_message_id) : null,
    bodyText: row.body_text ? String(row.body_text) : null,
    logicalSeq: Number(row.logical_seq ?? 0),
    deliveryStatus: String(row.delivery_status),
    createdAt: new Date(String(row.created_at)).toISOString()
  }));
}

export async function getNextConversationSeq(trx: Knex.Transaction, tenantId: string, waConversationId: string) {
  const row = await trx("wa_conversations")
    .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
    .select("message_cursor")
    .first<{ message_cursor: string | number } | undefined>();
  return Number(row?.message_cursor ?? 0) + 1;
}

export async function incrementConversationCursor(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; waMessageId: string; providerTs?: number | null }
) {
  await trx("wa_conversations")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .update({
      message_cursor: trx.raw("message_cursor + 1"),
      last_message_id: input.waMessageId,
      last_message_at: input.providerTs ? trx.raw("to_timestamp(? / 1000.0)", [input.providerTs]) : trx.fn.now(),
      updated_at: trx.fn.now()
    });
}

export async function upsertWaConversation(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    chatJid: string;
    conversationType: string;
    subject?: string | null;
    contactJid?: string | null;
  }
) {
  const existing = await trx("wa_conversations")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      chat_jid: input.chatJid
    })
    .first<Record<string, unknown> | undefined>();

  if (existing) {
    const [row] = await trx("wa_conversations")
      .where({ wa_conversation_id: existing.wa_conversation_id })
      .update({
        subject: input.subject ?? existing.subject ?? null,
        contact_jid: input.contactJid ?? existing.contact_jid ?? null,
        conversation_type: input.conversationType,
        updated_at: trx.fn.now()
      })
      .returning("*");
    return mapConversation(row as Record<string, unknown>);
  }

  const [row] = await trx("wa_conversations")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      chat_jid: input.chatJid,
      conversation_type: input.conversationType,
      subject: input.subject ?? null,
      contact_jid: input.contactJid ?? null
    })
    .returning("*");
  return mapConversation(row as Record<string, unknown>);
}

export async function insertWaMessage(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    waConversationId: string;
    providerMessageId?: string | null;
    direction: string;
    senderJid?: string | null;
    senderMemberId?: string | null;
    senderRole: string;
    participantJid?: string | null;
    bodyText?: string | null;
    providerTs?: number | null;
    messageType?: string;
    messageScene?: string;
    quotedMessageId?: string | null;
    deliveryStatus?: string;
    providerPayload?: Record<string, unknown>;
  }
) {
  const nextSeq = await getNextConversationSeq(trx, input.tenantId, input.waConversationId);
  const [row] = await trx("wa_messages")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      wa_conversation_id: input.waConversationId,
      provider_message_id: input.providerMessageId ?? null,
      direction: input.direction,
      sender_jid: input.senderJid ?? null,
      sender_member_id: input.senderMemberId ?? null,
      sender_role: input.senderRole,
      participant_jid: input.participantJid ?? null,
      body_text: input.bodyText ?? null,
      provider_ts: input.providerTs ?? null,
      logical_seq: nextSeq,
      message_type: input.messageType ?? "text",
      message_scene: input.messageScene ?? "external_chat",
      quoted_message_id: input.quotedMessageId ?? null,
      delivery_status: input.deliveryStatus ?? "pending",
      provider_payload: JSON.stringify(input.providerPayload ?? {})
    })
    .returning("*");

  await incrementConversationCursor(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId,
    waMessageId: String(row.wa_message_id),
    providerTs: input.providerTs ?? null
  });

  return row;
}

export async function insertWaMessageAttachment(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waMessageId: string;
    attachmentType: string;
    mimeType?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
    storageUrl?: string | null;
    previewUrl?: string | null;
    providerPayload?: Record<string, unknown>;
  }
) {
  const [row] = await trx("wa_message_attachments")
    .insert({
      tenant_id: input.tenantId,
      wa_message_id: input.waMessageId,
      attachment_type: input.attachmentType,
      mime_type: input.mimeType ?? null,
      file_name: input.fileName ?? null,
      file_size: input.fileSize ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      duration_ms: input.durationMs ?? null,
      storage_url: input.storageUrl ?? null,
      preview_url: input.previewUrl ?? null,
      provider_payload: JSON.stringify(input.providerPayload ?? {})
    })
    .returning("*");
  return row;
}

export async function insertWaMessageReaction(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waMessageId: string;
    actorJid?: string | null;
    actorMemberId?: string | null;
    emoji: string;
    providerTs?: number | null;
  }
) {
  const [row] = await trx("wa_message_reactions")
    .insert({
      tenant_id: input.tenantId,
      wa_message_id: input.waMessageId,
      actor_jid: input.actorJid ?? null,
      actor_member_id: input.actorMemberId ?? null,
      emoji: input.emoji,
      provider_ts: input.providerTs ?? null
    })
    .returning("*");
  return row;
}

export async function upsertWaConversationMember(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waConversationId: string;
    participantJid: string;
    participantType?: string;
    displayName?: string | null;
    isAdmin?: boolean;
    left?: boolean;
  }
) {
  const existing = await trx("wa_conversation_members")
    .where({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId,
      participant_jid: input.participantJid
    })
    .first<Record<string, unknown> | undefined>();

  if (existing) {
    const [row] = await trx("wa_conversation_members")
      .where({ member_row_id: existing.member_row_id })
      .update({
        participant_type: input.participantType ?? existing.participant_type,
        display_name: input.displayName ?? existing.display_name ?? null,
        is_admin: typeof input.isAdmin === "boolean" ? input.isAdmin : existing.is_admin,
        left_at: input.left ? trx.fn.now() : null,
        updated_at: trx.fn.now()
      })
      .returning("*");
    return row;
  }

  const [row] = await trx("wa_conversation_members")
    .insert({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId,
      participant_jid: input.participantJid,
      participant_type: input.participantType ?? "group_member",
      display_name: input.displayName ?? null,
      is_admin: input.isAdmin ?? false,
      left_at: input.left ? trx.fn.now() : null
    })
    .returning("*");
  return row;
}

export async function insertRawEvent(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    providerEventType: string;
    providerEventKey: string;
    providerTs?: number | null;
    payload: Record<string, unknown>;
  }
) {
  const [row] = await trx("wa_message_raw_events")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      provider_event_type: input.providerEventType,
      provider_event_key: input.providerEventKey,
      provider_ts: input.providerTs ?? null,
      payload: JSON.stringify(input.payload),
      process_status: "done",
      processed_at: trx.fn.now()
    })
    .onConflict(["tenant_id", "wa_account_id", "provider_event_key"])
    .ignore()
    .returning("*");
  return row ?? null;
}
