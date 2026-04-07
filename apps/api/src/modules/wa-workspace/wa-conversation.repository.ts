/**
 * 作用:
 * - 封装 WA 会话、消息、原始事件的数据库访问。
 *
 * 交互:
 * - 被 workbench、provider webhook 服务调用。
 * - 提供会话 upsert、消息插入、列表与详情查询能力。
 */
import type { Knex } from "knex";

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

function isNonConversationJid(jid: string | null) {
  return jid === "status@broadcast";
}

function deriveConversationDisplayName(row: Record<string, unknown>) {
  const conversationType = asString(row.conversation_type);
  if (conversationType === "group") {
    return (
      asString(row.subject) ??
      asString(row.chat_jid) ??
      null
    );
  }
  return (
    asString(row.contact_name) ??
    asString(row.contact_phone_e164) ??
    asString(row.contact_jid) ??
    asString(row.chat_jid) ??
    null
  );
}

type ResolvedContactProfile = {
  displayName: string | null;
  phoneE164: string | null;
  avatarUrl: string | null;
};

function buildContactKey(waAccountId: string, identifier: string) {
  return `${waAccountId}:${identifier}`;
}

async function loadWaContactProfiles(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountIds: string[];
    identifiers?: string[];
    phones?: string[];
  }
) {
  const identifiers = Array.from(new Set((input.identifiers ?? []).filter((value): value is string => Boolean(asString(value)))));
  const phones = Array.from(new Set((input.phones ?? []).filter((value): value is string => Boolean(asString(value)))));
  if (input.waAccountIds.length === 0 || (identifiers.length === 0 && phones.length === 0)) {
    return new Map<string, ResolvedContactProfile>();
  }

  const rows = await trx("wa_contacts")
    .whereIn("wa_account_id", input.waAccountIds)
    .andWhere("tenant_id", input.tenantId)
    .andWhere((builder) => {
      if (identifiers.length > 0) {
        builder.whereIn("contact_jid", identifiers);
      }
      if (phones.length > 0) {
        if (identifiers.length > 0) builder.orWhereIn("phone_e164", phones);
        else builder.whereIn("phone_e164", phones);
      }
    })
    .select("wa_account_id", "contact_jid", "phone_e164", "display_name", "notify_name", "verified_name", "avatar_url")
    .orderBy("updated_at", "desc");

  const map = new Map<string, ResolvedContactProfile>();
  for (const row of rows) {
    const waAccountId = String(row.wa_account_id);
    const displayName =
      asString(row.display_name) ??
      asString(row.notify_name) ??
      asString(row.verified_name) ??
      null;
    const phoneE164 = asString(row.phone_e164);
    const contactJid = asString(row.contact_jid);

    const avatarUrl = asString(row.avatar_url);
    if (contactJid) {
      const key = buildContactKey(waAccountId, contactJid);
      if (!map.has(key)) {
        map.set(key, { displayName, phoneE164, avatarUrl });
      }
    }
    if (phoneE164) {
      const key = buildContactKey(waAccountId, phoneE164);
      if (!map.has(key)) {
        map.set(key, { displayName, phoneE164, avatarUrl });
      }
    }
  }
  return map;
}

function resolveContactProfile(
  contactProfiles: Map<string, ResolvedContactProfile>,
  waAccountId: string,
  identifiers: Array<string | null | undefined>
) {
  for (const identifier of identifiers) {
    const normalized = asString(identifier ?? null);
    if (!normalized) continue;
    const profile = contactProfiles.get(buildContactKey(waAccountId, normalized));
    if (profile) return profile;
  }
  return null;
}

function mapConversation(row: Record<string, unknown>) {
  return {
    waConversationId: String(row.wa_conversation_id),
    waAccountId: String(row.wa_account_id),
    chatJid: String(row.chat_jid),
    conversationType: String(row.conversation_type),
    subject: row.subject ? String(row.subject) : null,
    displayName: deriveConversationDisplayName(row),
    contactJid: row.contact_jid ? String(row.contact_jid) : null,
    contactName: row.contact_name ? String(row.contact_name) : null,
    contactPhoneE164: row.contact_phone_e164 ? String(row.contact_phone_e164) : null,
    conversationStatus: String(row.conversation_status),
    currentReplierMembershipId: row.current_replier_membership_id ? String(row.current_replier_membership_id) : null,
    currentReplierName: row.current_replier_name ? String(row.current_replier_name) : null,
    accountDisplayName: row.account_display_name ? String(row.account_display_name) : null,
    lastMessageAt: row.last_message_at ? new Date(String(row.last_message_at)).toISOString() : null,
    lastMessagePreview: row.last_message_preview ? String(row.last_message_preview) : null,
    unreadCount: Number(row.unread_count ?? 0),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null
  };
}

function mapGap(row: Record<string, unknown>) {
  return {
    gapId: String(row.gap_id),
    tenantId: String(row.tenant_id),
    waAccountId: String(row.wa_account_id),
    waConversationId: String(row.wa_conversation_id),
    gapReason: String(row.gap_reason),
    payload: typeof row.payload === "string" ? JSON.parse(String(row.payload)) : (row.payload as Record<string, unknown>),
    status: String(row.status),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function safeParseRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function extractPayloadPushName(payload: unknown) {
  const record = safeParseRecord(payload);
  return asString(record?.pushName);
}

function extractPayloadAltJid(payload: unknown) {
  const record = safeParseRecord(payload);
  const key = safeParseRecord(record?.key);
  return asString(key?.participantAlt) ?? asString(key?.remoteJidAlt);
}

/**
 * Best-effort extraction of body text from a stored WAMessage provider_payload.
 * Used as a fallback when the body_text column is NULL (e.g. for messages stored
 * before the mapper was updated to handle interactive/ephemeral types).
 */
function extractBodyTextFromPayload(payload: unknown): string | null {
  const record = safeParseRecord(payload);
  if (!record) return null;
  const msg = safeParseRecord(record.message);
  if (!msg) return null;

  // Helper to safely read a string field from a nested record path.
  function pick(...keys: string[]): string | null {
    let cur: unknown = msg;
    for (const k of keys) {
      cur = safeParseRecord(cur)?.[k];
      if (cur == null) return null;
    }
    return asString(cur);
  }

  return (
    pick("conversation") ??
    pick("extendedTextMessage", "text") ??
    pick("imageMessage", "caption") ??
    pick("videoMessage", "caption") ??
    pick("documentMessage", "caption") ??
    // Interactive types
    pick("buttonsMessage", "contentText") ??
    pick("buttonsMessage", "text") ??
    pick("buttonsResponseMessage", "selectedDisplayText") ??
    pick("listMessage", "description") ??
    pick("listMessage", "title") ??
    pick("listResponseMessage", "title") ??
    pick("listResponseMessage", "description") ??
    pick("interactiveMessage", "body", "text") ??
    pick("templateMessage", "hydratedTemplate", "hydratedContentText") ??
    pick("templateButtonReplyMessage", "selectedDisplayText") ??
    pick("pollCreationMessage", "name") ??
    pick("pollCreationMessageV2", "name") ??
    pick("pollCreationMessageV3", "name") ??
    pick("orderMessage", "message") ??
    // Ephemeral / viewOnce wrappers — recurse into inner message
    (() => {
      const wrappers = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"];
      for (const wk of wrappers) {
        const inner = safeParseRecord(msg[wk]);
        if (inner) {
          const text = extractBodyTextFromPayload({ message: safeParseRecord(inner.message) ?? inner });
          if (text) return text;
        }
      }
      return null;
    })()
  );
}

function buildConversationBaseQuery(trx: Knex.Transaction, tenantId: string) {
  return trx("wa_conversations as c")
    .leftJoin("tenant_memberships as tm", function joinReplier() {
      this.on("tm.membership_id", "=", "c.current_replier_membership_id").andOn("tm.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("wa_accounts as a", function joinAccount() {
      this.on("a.wa_account_id", "=", "c.wa_account_id").andOn("a.tenant_id", "=", "c.tenant_id");
    })
    .where("c.tenant_id", tenantId)
    .whereNot("c.chat_jid", "status@broadcast")
    .select("c.*", "tm.display_name as current_replier_name", "a.display_name as account_display_name");
}

export async function getWaConversationById(trx: Knex.Transaction, tenantId: string, waConversationId: string) {
  const row = await buildConversationBaseQuery(trx, tenantId)
    .where({ "c.wa_conversation_id": waConversationId })
    .first<Record<string, unknown> | undefined>();
  if (!row) return null;
  const waAccountId = String(row.wa_account_id);

  const latestInbound = await trx("wa_messages")
    .where({
      tenant_id: tenantId,
      wa_conversation_id: waConversationId,
      direction: "inbound"
    })
    .select("provider_payload")
    .orderBy("logical_seq", "desc")
    .first<Record<string, unknown> | undefined>();
  const inboundPayload = safeParseRecord(latestInbound?.provider_payload);
  const fallbackPushName = asString(inboundPayload?.pushName);
  const fallbackPhone = normalizePhoneE164(derivePhoneE164FromJid(extractPayloadAltJid(inboundPayload)));
  const contactProfiles = await loadWaContactProfiles(trx, {
    tenantId,
    waAccountIds: [waAccountId],
    identifiers: [asString(row.contact_jid), asString(row.chat_jid)],
    phones: [asString(row.contact_phone_e164), fallbackPhone]
  });
  const contactProfile = resolveContactProfile(contactProfiles, waAccountId, [
    asString(row.contact_jid),
    asString(row.chat_jid),
    asString(row.contact_phone_e164),
    fallbackPhone
  ]);

  const isDirect = String(row.conversation_type) === "direct";
  return {
    ...mapConversation(row),
    contactName: asString(row.contact_name) ?? contactProfile?.displayName ?? (isDirect ? fallbackPushName : null),
    contactPhoneE164: asString(row.contact_phone_e164) ?? contactProfile?.phoneE164 ?? (isDirect ? fallbackPhone : null),
    displayName:
      asString(row.contact_name) ??
      contactProfile?.displayName ??
      (isDirect ? fallbackPushName : null) ??
      asString(row.contact_phone_e164) ??
      contactProfile?.phoneE164 ??
      (isDirect ? fallbackPhone : null) ??
      deriveConversationDisplayName(row)
  };
}

export async function listWaConversations(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountIds: string[]; assignedToMembershipId?: string | null; type?: string | null }
) {
  if (input.waAccountIds.length === 0) return [];
  const query = buildConversationBaseQuery(trx, input.tenantId)
    .whereIn("c.wa_account_id", input.waAccountIds)
    .andWhere((builder) => {
      builder.whereNotNull("c.last_message_at").orWhere("c.message_cursor", ">", 0);
    });

  if (input.assignedToMembershipId) {
    query.andWhere("c.current_replier_membership_id", input.assignedToMembershipId);
  }
  if (input.type) {
    query.andWhere("c.conversation_type", input.type);
  }

  const rows = await query
    .orderByRaw("case when c.last_message_at is null and coalesce(c.message_cursor, 0) = 0 then 1 else 0 end asc")
    .orderByRaw("coalesce(c.last_message_at, c.created_at) desc")
    .orderBy("c.message_cursor", "desc")
    .orderBy("c.updated_at", "desc");
  const contactProfiles = await loadWaContactProfiles(trx, {
    tenantId: input.tenantId,
    waAccountIds: Array.from(new Set(rows.map((row) => String(row.wa_account_id)))),
    identifiers: rows.flatMap((row) => [asString(row.contact_jid), asString(row.chat_jid)]),
    phones: rows.flatMap((row) => [asString(row.contact_phone_e164)])
  });
  const conversationIds = rows.map((row) => String(row.wa_conversation_id));
  const messageRows = conversationIds.length === 0
    ? []
    : await trx("wa_messages")
        .where("tenant_id", input.tenantId)
        .whereIn("wa_conversation_id", conversationIds)
        .select("wa_conversation_id", "body_text", "logical_seq", "direction", "provider_payload")
        .orderBy("wa_conversation_id", "asc")
        .orderBy("logical_seq", "desc");

  const previewByConversation = new Map<string, string>();
  const pushNameByConversation = new Map<string, string>();
  const phoneByConversation = new Map<string, string>();
  for (const row of messageRows) {
    const waConversationId = String(row.wa_conversation_id);
    if (previewByConversation.has(waConversationId)) continue;
    const preview = row.body_text
      ? String(row.body_text)
      : (extractBodyTextFromPayload(row.provider_payload) ?? "");
    previewByConversation.set(waConversationId, preview);
  }
  for (const row of messageRows) {
    const waConversationId = String(row.wa_conversation_id);
    if (pushNameByConversation.has(waConversationId)) continue;
    if (String(row.direction) !== "inbound") continue;
    const payload = safeParseRecord(row.provider_payload);
    const pushName = asString(payload?.pushName);
    if (pushName) {
      pushNameByConversation.set(waConversationId, pushName);
    }
    const altPhone = normalizePhoneE164(derivePhoneE164FromJid(extractPayloadAltJid(payload)));
    if (altPhone) {
      phoneByConversation.set(waConversationId, altPhone);
    }
  }

  return rows.map((row) => ({
    ...(function mapConversationRow() {
      const record = row as Record<string, unknown>;
      const waAccountId = String(record.wa_account_id);
      const isDirect = String(record.conversation_type) === "direct";
      const profile = resolveContactProfile(contactProfiles, waAccountId, [
        asString(record.contact_jid),
        asString(record.chat_jid),
        asString(record.contact_phone_e164),
        phoneByConversation.get(String(row.wa_conversation_id)) ?? null
      ]);
      return {
        ...mapConversation(record),
        contactName:
          asString(record.contact_name) ??
          profile?.displayName ??
          (isDirect ? (pushNameByConversation.get(String(row.wa_conversation_id)) ?? null) : null) ??
          null,
        contactPhoneE164:
          asString(record.contact_phone_e164) ??
          profile?.phoneE164 ??
          (isDirect ? (phoneByConversation.get(String(row.wa_conversation_id)) ?? null) : null),
        displayName:
          asString(record.contact_name) ??
          profile?.displayName ??
          (isDirect ? (pushNameByConversation.get(String(row.wa_conversation_id)) ?? null) : null) ??
          asString(record.contact_phone_e164) ??
          profile?.phoneE164 ??
          (isDirect ? (phoneByConversation.get(String(row.wa_conversation_id)) ?? null) : null) ??
          deriveConversationDisplayName(record),
        avatarUrl: asString(record.avatar_url) ?? profile?.avatarUrl ?? null
      };
    })(),
    lastMessagePreview: previewByConversation.get(String(row.wa_conversation_id)) ?? null
  }));
}

export async function getWaConversationListItem(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string }
) {
  const row = await buildConversationBaseQuery(trx, input.tenantId)
    .where("c.wa_conversation_id", input.waConversationId)
    .first<Record<string, unknown> | undefined>();
  if (!row) return null;
  const waAccountId = String(row.wa_account_id);

  const messageRow = await trx("wa_messages")
    .where({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId
    })
    .select("body_text", "direction", "provider_payload")
    .orderBy("logical_seq", "desc")
    .first<Record<string, unknown> | undefined>();

  const inboundRow = await trx("wa_messages")
    .where({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId,
      direction: "inbound"
    })
    .select("provider_payload")
    .orderBy("logical_seq", "desc")
    .first<Record<string, unknown> | undefined>();
  const inboundPayload = safeParseRecord(inboundRow?.provider_payload);
  const fallbackPushName = asString(inboundPayload?.pushName);
  const fallbackPhone = normalizePhoneE164(derivePhoneE164FromJid(extractPayloadAltJid(inboundPayload)));
  const contactProfiles = await loadWaContactProfiles(trx, {
    tenantId: input.tenantId,
    waAccountIds: [waAccountId],
    identifiers: [asString(row.contact_jid), asString(row.chat_jid)],
    phones: [asString(row.contact_phone_e164), fallbackPhone]
  });
  const contactProfile = resolveContactProfile(contactProfiles, waAccountId, [
    asString(row.contact_jid),
    asString(row.chat_jid),
    asString(row.contact_phone_e164),
    fallbackPhone
  ]);

  const isDirect = String(row.conversation_type) === "direct";
  return {
    ...mapConversation(row),
    contactName: asString(row.contact_name) ?? contactProfile?.displayName ?? (isDirect ? fallbackPushName : null),
    contactPhoneE164: asString(row.contact_phone_e164) ?? contactProfile?.phoneE164 ?? (isDirect ? fallbackPhone : null),
    displayName:
      asString(row.contact_name) ??
      contactProfile?.displayName ??
      (isDirect ? fallbackPushName : null) ??
      asString(row.contact_phone_e164) ??
      contactProfile?.phoneE164 ??
      (isDirect ? fallbackPhone : null) ??
      deriveConversationDisplayName(row),
    lastMessagePreview: messageRow?.body_text
      ? String(messageRow.body_text)
      : (messageRow ? extractBodyTextFromPayload(messageRow.provider_payload) : null)
  };
}

export async function findWaMessageByProviderId(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; providerMessageId: string }
) {
  const row = await trx("wa_messages")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      provider_message_id: input.providerMessageId
    })
    .first<Record<string, unknown> | undefined>();

  if (!row) return null;
  return {
    waMessageId: String(row.wa_message_id),
    waConversationId: String(row.wa_conversation_id),
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null
  };
}

export async function updateWaMessageByProviderId(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    providerMessageId: string;
    deliveryStatus?: string | null;
    providerPayload?: Record<string, unknown>;
    bodyText?: string | null;
  }
) {
  const updates: Record<string, unknown> = {
    updated_at: trx.fn.now()
  };

  if (typeof input.deliveryStatus === "string" && input.deliveryStatus.trim()) {
    updates.delivery_status = input.deliveryStatus.trim();
  }
  if (input.bodyText !== undefined) {
    updates.body_text = input.bodyText ?? null;
  }
  if (input.providerPayload) {
    updates.provider_payload = JSON.stringify(input.providerPayload);
  }

  const [row] = await trx("wa_messages")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      provider_message_id: input.providerMessageId
    })
    .update(updates)
    .returning("*");

  return row ?? null;
}

export async function upsertWaMessageReceipt(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waMessageId: string;
    userJid: string;
    receiptStatus: string;
    receiptTs?: number | null;
    readTs?: number | null;
    playedTs?: number | null;
    pendingDeviceJids?: string[];
    deliveredDeviceJids?: string[];
    providerPayload?: Record<string, unknown>;
  }
) {
  const existing = await trx("wa_message_receipts")
    .where({
      tenant_id: input.tenantId,
      wa_message_id: input.waMessageId,
      user_jid: input.userJid
    })
    .first<Record<string, unknown> | undefined>();

  const patch = {
    receipt_status: input.receiptStatus,
    receipt_ts: input.receiptTs ?? null,
    read_ts: input.readTs ?? null,
    played_ts: input.playedTs ?? null,
    pending_device_jids: JSON.stringify(input.pendingDeviceJids ?? []),
    delivered_device_jids: JSON.stringify(input.deliveredDeviceJids ?? []),
    provider_payload: JSON.stringify(input.providerPayload ?? {}),
    updated_at: trx.fn.now()
  };

  if (existing) {
    const [row] = await trx("wa_message_receipts")
      .where({ receipt_id: existing.receipt_id })
      .update(patch)
      .returning("*");
    return row;
  }

  const [row] = await trx("wa_message_receipts")
    .insert({
      tenant_id: input.tenantId,
      wa_message_id: input.waMessageId,
      user_jid: input.userJid,
      ...patch
    })
    .returning("*");
  return row;
}

export async function getWaMessageReceiptSummary(
  trx: Knex.Transaction,
  input: { tenantId: string; waMessageId: string }
) {
  const rows = await trx("wa_message_receipts")
    .where({ tenant_id: input.tenantId, wa_message_id: input.waMessageId })
    .orderBy("updated_at", "asc");

  const statusCounts: Record<string, number> = {};
  let latestStatus: string | null = null;
  let latestAt: string | null = null;

  for (const row of rows) {
    const status = String(row.receipt_status);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    latestStatus = status;
    latestAt = row.updated_at ? new Date(String(row.updated_at)).toISOString() : latestAt;
  }

  return {
    totalReceipts: rows.length,
    latestStatus,
    latestAt,
    statusCounts
  };
}

export async function getConversationMessages(
  trx: Knex.Transaction,
  tenantId: string,
  waConversationId: string,
  limit = 100,
  beforeLogicalSeq?: number | null
) {
  const conversationRow = await trx("wa_conversations")
    .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
    .select("conversation_type", "contact_name", "contact_phone_e164", "chat_jid", "contact_jid", "wa_account_id")
    .first<Record<string, unknown> | undefined>();
  const baseQuery = trx("wa_messages")
    .where({ tenant_id: tenantId, wa_conversation_id: waConversationId });
  if (beforeLogicalSeq != null) {
    baseQuery.where("logical_seq", "<", beforeLogicalSeq);
  }
  const latestRowsSubquery = baseQuery
    .select("*")
    .orderByRaw("coalesce(provider_ts, (extract(epoch from created_at) * 1000)::bigint, logical_seq) desc")
    .orderBy("logical_seq", "desc")
    .limit(limit)
    .as("latest_messages");
  const rows = await trx
    .from(latestRowsSubquery)
    .select("*")
    .orderByRaw("coalesce(provider_ts, (extract(epoch from created_at) * 1000)::bigint, logical_seq) asc")
    .orderBy("logical_seq", "asc");

  const waMessageIds = rows.map((row) => String(row.wa_message_id));
  const participantJids = Array.from(new Set(rows.map((row) => (row.participant_jid ? String(row.participant_jid) : null)).filter(Boolean))) as string[];
  const contactProfiles = await loadWaContactProfiles(trx, {
    tenantId,
    waAccountIds: conversationRow?.wa_account_id ? [String(conversationRow.wa_account_id)] : [],
    identifiers: Array.from(new Set([
      ...participantJids,
      ...rows.map((row) => (row.sender_jid ? String(row.sender_jid) : null)),
      ...rows.map((row) => extractPayloadAltJid(row.provider_payload))
    ].filter(Boolean) as string[])),
    phones: Array.from(new Set(rows.map((row) => normalizePhoneE164(derivePhoneE164FromJid(extractPayloadAltJid(row.provider_payload)))).filter(Boolean) as string[]))
  });
  const [attachmentRows, reactionRows, receiptRows] = await Promise.all([
    waMessageIds.length === 0
      ? []
      : trx("wa_message_attachments")
          .where({ tenant_id: tenantId })
          .whereIn("wa_message_id", waMessageIds)
          .select("*")
          .orderBy("created_at", "asc"),
    waMessageIds.length === 0
      ? []
      : trx("wa_message_reactions")
          .where({ tenant_id: tenantId })
          .whereIn("wa_message_id", waMessageIds)
          .select("*")
          .orderBy("created_at", "asc"),
    waMessageIds.length === 0
      ? []
      : trx("wa_message_receipts")
          .where({ tenant_id: tenantId })
          .whereIn("wa_message_id", waMessageIds)
          .select("*")
          .orderBy("updated_at", "asc")
  ]);
  const memberRows = participantJids.length === 0
    ? []
    : await trx("wa_conversation_members")
        .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
        .whereIn("participant_jid", participantJids)
        .select("participant_jid", "display_name");
  const memberNameByParticipant = new Map<string, string>();
  const memberPhoneByParticipant = new Map<string, string>();
  for (const row of memberRows) {
    const name = asString(row.display_name);
    if (name) {
      memberNameByParticipant.set(String(row.participant_jid), name);
    }
  }

  const attachmentsByMessage = new Map<string, Array<Record<string, unknown>>>();
  for (const row of attachmentRows) {
    const waMessageId = String(row.wa_message_id);
    const bucket = attachmentsByMessage.get(waMessageId) ?? [];
    bucket.push(row as Record<string, unknown>);
    attachmentsByMessage.set(waMessageId, bucket);
  }

  const reactionsByMessage = new Map<string, Array<Record<string, unknown>>>();
  for (const row of reactionRows) {
    const waMessageId = String(row.wa_message_id);
    const bucket = reactionsByMessage.get(waMessageId) ?? [];
    bucket.push(row as Record<string, unknown>);
    reactionsByMessage.set(waMessageId, bucket);
  }

  const receiptsByMessage = new Map<string, Array<Record<string, unknown>>>();
  for (const row of receiptRows) {
    const waMessageId = String(row.wa_message_id);
    const bucket = receiptsByMessage.get(waMessageId) ?? [];
    bucket.push(row as Record<string, unknown>);
    receiptsByMessage.set(waMessageId, bucket);
  }

  return rows.map((row) => {
    const payloadPushName = extractPayloadPushName(row.provider_payload);
    const payloadAltPhone = normalizePhoneE164(derivePhoneE164FromJid(extractPayloadAltJid(row.provider_payload)));
    const participantJid = row.participant_jid ? String(row.participant_jid) : null;
    const senderPhone = normalizePhoneE164(derivePhoneE164FromJid(row.sender_jid ? String(row.sender_jid) : null));
    const waAccountId = conversationRow?.wa_account_id ? String(conversationRow.wa_account_id) : "";
    const senderProfile = resolveContactProfile(contactProfiles, waAccountId, [
      participantJid,
      extractPayloadAltJid(row.provider_payload),
      row.sender_jid ? String(row.sender_jid) : null,
      payloadAltPhone,
      senderPhone
    ]);
    if (participantJid && payloadAltPhone && !memberPhoneByParticipant.has(participantJid)) {
      memberPhoneByParticipant.set(participantJid, payloadAltPhone);
    }
    const senderDisplayName =
      String(conversationRow?.conversation_type ?? "") === "group"
        ? (
            (participantJid ? memberNameByParticipant.get(participantJid) : null) ??
            senderProfile?.displayName ??
            payloadPushName ??
            payloadAltPhone ??
            senderProfile?.phoneE164 ??
            (participantJid ? memberPhoneByParticipant.get(participantJid) : null) ??
            senderPhone ??
            participantJid
          )
        : (
            asString(conversationRow?.contact_name) ??
            asString(conversationRow?.contact_phone_e164) ??
            senderProfile?.displayName ??
            senderProfile?.phoneE164 ??
            asString(conversationRow?.chat_jid)
          );
    const receiptItems = (receiptsByMessage.get(String(row.wa_message_id)) ?? []).map((item) => ({
      receiptId: String(item.receipt_id),
      userJid: String(item.user_jid),
      receiptStatus: String(item.receipt_status),
      receiptAt: item.receipt_ts ? new Date(Number(item.receipt_ts)).toISOString() : null,
      readAt: item.read_ts ? new Date(Number(item.read_ts)).toISOString() : null,
      playedAt: item.played_ts ? new Date(Number(item.played_ts)).toISOString() : null
    }));
    const latestReceipt = receiptItems[receiptItems.length - 1] ?? null;
    const statusCounts = receiptItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.receiptStatus] = (acc[item.receiptStatus] ?? 0) + 1;
      return acc;
    }, {});

    return {
      waMessageId: String(row.wa_message_id),
      providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
      direction: String(row.direction),
      messageType: String(row.message_type),
      messageScene: String(row.message_scene),
      senderJid: row.sender_jid ? String(row.sender_jid) : null,
      senderDisplayName: String(row.direction) === "outbound" ? null : senderDisplayName,
      senderMemberId: row.sender_member_id ? String(row.sender_member_id) : null,
      senderRole: String(row.sender_role),
      participantJid: row.participant_jid ? String(row.participant_jid) : null,
      quotedMessageId: row.quoted_message_id ? String(row.quoted_message_id) : null,
      bodyText: row.body_text
        ? String(row.body_text)
        : extractBodyTextFromPayload(row.provider_payload),
      logicalSeq: Number(row.logical_seq ?? 0),
      deliveryStatus: String(row.delivery_status),
      providerTs: row.provider_ts ? new Date(Number(row.provider_ts)).toISOString() : null,
      receiptSummary: receiptItems.length > 0
        ? {
            totalReceipts: receiptItems.length,
            latestStatus: latestReceipt?.receiptStatus ?? null,
            latestAt: latestReceipt?.playedAt ?? latestReceipt?.readAt ?? latestReceipt?.receiptAt ?? null,
            statusCounts
          }
        : (safeParseRecord(row.provider_payload)?.receiptSummary ?? null),
      receipts: receiptItems,
      attachments: (attachmentsByMessage.get(String(row.wa_message_id)) ?? []).map((item) => ({
        attachmentId: String(item.attachment_id),
        attachmentType: String(item.attachment_type),
        mimeType: item.mime_type ? String(item.mime_type) : null,
        fileName: item.file_name ? String(item.file_name) : null,
        fileSize: item.file_size ? Number(item.file_size) : null,
        width: item.width ? Number(item.width) : null,
        height: item.height ? Number(item.height) : null,
        durationMs: item.duration_ms ? Number(item.duration_ms) : null,
        storageUrl: item.storage_url ? String(item.storage_url) : null,
        previewUrl: item.preview_url ? String(item.preview_url) : null
      })),
      reactions: (reactionsByMessage.get(String(row.wa_message_id)) ?? []).map((item) => ({
        reactionId: String(item.reaction_id),
        actorJid: item.actor_jid ? String(item.actor_jid) : null,
        actorMemberId: item.actor_member_id ? String(item.actor_member_id) : null,
        emoji: String(item.emoji),
        createdAt: new Date(String(item.created_at)).toISOString()
      })),
      createdAt: new Date(String(row.created_at)).toISOString()
    };
  });
}

export async function getConversationMembers(
  trx: Knex.Transaction,
  tenantId: string,
  waConversationId: string
) {
  const conversationRow = await trx("wa_conversations")
    .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
    .select("wa_account_id")
    .first<Record<string, unknown> | undefined>();
  const rows = await trx("wa_conversation_members")
    .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
    .orderBy("joined_at", "asc");

  const participantJids = rows.map((row) => String(row.participant_jid));
  const latestMessageRows = participantJids.length === 0
    ? []
    : await trx("wa_messages")
        .where({ tenant_id: tenantId, wa_conversation_id: waConversationId })
        .whereIn("participant_jid", participantJids)
        .whereNotNull("provider_payload")
        .select("participant_jid", "provider_payload", "provider_ts", "created_at")
        .orderByRaw("coalesce(provider_ts, (extract(epoch from created_at) * 1000)::bigint) desc");
  const contactProfiles = await loadWaContactProfiles(trx, {
    tenantId,
    waAccountIds: conversationRow?.wa_account_id ? [String(conversationRow.wa_account_id)] : [],
    identifiers: participantJids,
    phones: participantJids
      .map((jid) => normalizePhoneE164(derivePhoneE164FromJid(jid)))
      .filter(Boolean) as string[]
  });
  const fallbackByParticipant = new Map<string, { displayName: string | null; phone: string | null }>();
  for (const row of latestMessageRows) {
    const participantJid = row.participant_jid ? String(row.participant_jid) : null;
    if (!participantJid) continue;
    const current = fallbackByParticipant.get(participantJid) ?? { displayName: null, phone: null };
    fallbackByParticipant.set(participantJid, {
      displayName: current.displayName ?? extractPayloadPushName(row.provider_payload),
      phone:
        current.phone ??
        normalizePhoneE164(derivePhoneE164FromJid(extractPayloadAltJid(row.provider_payload))) ??
        normalizePhoneE164(derivePhoneE164FromJid(participantJid))
    });
  }

  const participantPhoneByKey = new Map<string, string>();
  for (const [participantJid, fallback] of fallbackByParticipant.entries()) {
    if (fallback.phone) {
      participantPhoneByKey.set(participantJid, fallback.phone);
    }
  }

  return rows.map((row) => ({
    ...(function mapMemberRow() {
      const waAccountId = conversationRow?.wa_account_id ? String(conversationRow.wa_account_id) : "";
      const participantJid = String(row.participant_jid);
      const fallbackPhone = participantPhoneByKey.get(participantJid) ?? null;
      const profile = resolveContactProfile(contactProfiles, waAccountId, [
        participantJid,
        fallbackPhone
      ]);
      return {
        memberRowId: String(row.member_row_id),
        participantJid,
        participantType: String(row.participant_type),
        displayName:
          (row.display_name ? String(row.display_name) : null) ??
          profile?.displayName ??
          profile?.phoneE164 ??
          fallbackByParticipant.get(participantJid)?.displayName ??
          fallbackByParticipant.get(participantJid)?.phone ??
          null,
        isAdmin: Boolean(row.is_admin),
        joinedAt: new Date(String(row.joined_at)).toISOString(),
        leftAt: row.left_at ? new Date(String(row.left_at)).toISOString() : null
      };
    })()
  }));
}

export async function getOrCreateDirectConversationForContact(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    contactJid: string;
    displayName?: string | null;
    phoneE164?: string | null;
  }
) {
  const existing = await trx("wa_conversations")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      chat_jid: input.contactJid
    })
    .first<Record<string, unknown> | undefined>();

  if (existing) {
    return mapConversation(existing);
  }

  return upsertWaConversation(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    chatJid: input.contactJid,
    conversationType: "direct",
    contactJid: input.contactJid,
    contactName: input.displayName ?? null,
    contactPhoneE164: input.phoneE164 ?? null
  });
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

export async function patchWaConversationChatState(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    chatJid: string;
    conversationType: string;
    subject?: string | null;
    contactJid?: string | null;
    contactName?: string | null;
    contactPhoneE164?: string | null;
    unreadCount?: number | null;
  }
) {
  const updates: Record<string, unknown> = {
    conversation_type: input.conversationType,
    updated_at: trx.fn.now()
  };

  const subject = asString(input.subject);
  const contactJid = asString(input.contactJid);
  const contactName = asString(input.contactName);
  const contactPhoneE164 = asString(input.contactPhoneE164);

  if (subject) updates.subject = subject;
  if (contactJid) updates.contact_jid = contactJid;
  if (contactName) updates.contact_name = contactName;
  if (contactPhoneE164) updates.contact_phone_e164 = contactPhoneE164;
  if (typeof input.unreadCount === "number" && Number.isFinite(input.unreadCount)) {
    updates.unread_count = Math.max(0, input.unreadCount);
  }

  const [row] = await trx("wa_conversations")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      chat_jid: input.chatJid
    })
    .update(updates)
    .returning("*");
  return row ? mapConversation(row as Record<string, unknown>) : null;
}

export async function incrementWaConversationUnread(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; chatJid: string }
) {
  const [row] = await trx("wa_conversations")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      chat_jid: input.chatJid
    })
    .update({
      unread_count: trx.raw("coalesce(unread_count, 0) + 1"),
      updated_at: trx.fn.now()
    })
    .returning("*");
  return row ? mapConversation(row as Record<string, unknown>) : null;
}

export async function resetWaConversationUnread(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; chatJid: string }
) {
  const [row] = await trx("wa_conversations")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      chat_jid: input.chatJid
    })
    .update({
      unread_count: 0,
      updated_at: trx.fn.now()
    })
    .returning("*");
  return row ? mapConversation(row as Record<string, unknown>) : null;
}

export async function patchWaConversationContactProfile(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    chatKeys: string[];
    contactName?: string | null;
    contactPhoneE164?: string | null;
  }
) {
  if (input.chatKeys.length === 0) return [];
  const updates: Record<string, unknown> = {
    updated_at: trx.fn.now()
  };
  const contactName = asString(input.contactName);
  const contactPhoneE164 = asString(input.contactPhoneE164);
  if (contactName) updates.contact_name = contactName;
  if (contactPhoneE164) updates.contact_phone_e164 = contactPhoneE164;
  if (Object.keys(updates).length === 1) return [];

  const rows = await trx("wa_conversations")
    .where("tenant_id", input.tenantId)
    .andWhere("wa_account_id", input.waAccountId)
    .andWhere((builder) => {
      builder.whereIn("chat_jid", input.chatKeys).orWhereIn("contact_jid", input.chatKeys);
    })
    .update(updates)
    .returning("*");
  return rows.map((row) => mapConversation(row as Record<string, unknown>));
}

export async function patchWaConversationMemberProfile(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    participantKeys: string[];
    displayName?: string | null;
  }
) {
  if (input.participantKeys.length === 0) return [];
  const updates: Record<string, unknown> = {
    updated_at: trx.fn.now()
  };
  const displayName = asString(input.displayName);
  if (displayName) updates.display_name = displayName;
  if (Object.keys(updates).length === 1) return [];

  const rows = await trx("wa_conversation_members")
    .where("tenant_id", input.tenantId)
    .whereIn("participant_jid", input.participantKeys)
    .update(updates)
    .returning("*");
  return rows;
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
    contactName?: string | null;
    contactPhoneE164?: string | null;
    unreadCount?: number | null;
  }
) {
  if (isNonConversationJid(input.chatJid)) {
    throw new Error("status@broadcast is not a valid conversation chat");
  }
  const existing = await trx("wa_conversations")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      chat_jid: input.chatJid
    })
    .first<Record<string, unknown> | undefined>();

  if (existing) {
    // Never downgrade a confirmed group conversation to direct.
    // A group JID (@g.us) is authoritative; once it's "group" it stays "group".
    const resolvedType =
      String(existing.conversation_type) === "group" ? "group" : input.conversationType;
    const [row] = await trx("wa_conversations")
      .where({ wa_conversation_id: existing.wa_conversation_id })
      .update({
        subject: input.subject ?? existing.subject ?? null,
        contact_jid: resolvedType === "group" ? null : (input.contactJid ?? existing.contact_jid ?? null),
        contact_name: resolvedType === "group" ? null : (input.contactName ?? existing.contact_name ?? null),
        contact_phone_e164:
          resolvedType === "group"
            ? null
            : (input.contactPhoneE164 ??
               (typeof existing.contact_phone_e164 === "string" ? existing.contact_phone_e164 : derivePhoneE164FromJid(input.contactJid ?? input.chatJid))),
        unread_count: typeof input.unreadCount === "number" ? Math.max(0, input.unreadCount) : Number(existing.unread_count ?? 0),
        conversation_type: resolvedType,
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
      contact_jid: input.contactJid ?? null,
      contact_name: input.contactName ?? null,
      contact_phone_e164: input.contactPhoneE164 ?? derivePhoneE164FromJid(input.contactJid ?? input.chatJid),
      unread_count: typeof input.unreadCount === "number" ? Math.max(0, input.unreadCount) : 0
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

export async function createWaMessageGap(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    waConversationId: string;
    gapReason: string;
    payload: Record<string, unknown>;
  }
) {
  const [row] = await trx("wa_message_gaps")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      wa_conversation_id: input.waConversationId,
      gap_reason: input.gapReason,
      payload: JSON.stringify(input.payload),
      status: "open"
    })
    .returning("*");
  return mapGap(row as Record<string, unknown>);
}

export async function listOpenWaMessageGaps(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string }
) {
  const rows = await trx("wa_message_gaps")
    .where({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId
    })
    .whereIn("status", ["open", "reconciling"])
    .orderBy("created_at", "asc");
  return rows.map((row) => mapGap(row as Record<string, unknown>));
}

export async function updateWaMessageGapStatus(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    gapId: string;
    status: "open" | "reconciling" | "resolved" | "manual_review";
    payload?: Record<string, unknown>;
  }
) {
  const updates: Record<string, unknown> = {
    status: input.status,
    updated_at: trx.fn.now()
  };
  if (input.payload) {
    updates.payload = JSON.stringify(input.payload);
  }

  const [row] = await trx("wa_message_gaps")
    .where({
      tenant_id: input.tenantId,
      gap_id: input.gapId
    })
    .update(updates)
    .returning("*");
  return row ? mapGap(row as Record<string, unknown>) : null;
}

export async function resolveWaMessageGapsByTarget(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; targetProviderMessageId: string }
) {
  if (typeof input.targetProviderMessageId !== "string" || !input.targetProviderMessageId.trim()) {
    return [];
  }

  const rows = await trx("wa_message_gaps")
    .where({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId
    })
    .whereIn("status", ["open", "reconciling"])
    .whereRaw("payload->>'targetProviderMessageId' = ?", [input.targetProviderMessageId])
    .select("*");

  if (rows.length === 0) return [];

  const updatedRows = await trx("wa_message_gaps")
    .whereIn("gap_id", rows.map((row) => row.gap_id))
    .update({
      status: "resolved",
      updated_at: trx.fn.now()
    })
    .returning("*");

  return updatedRows.map((row) => mapGap(row as Record<string, unknown>));
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

// ─── WA Contacts ─────────────────────────────────────────────────────────────

export async function upsertWaContact(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    contactJid: string;
    aliasJids?: string[];
    phoneE164?: string | null;
    displayName?: string | null;
    notifyName?: string | null;
    verifiedName?: string | null;
    avatarUrl?: string | null;
  }
) {
  const aliasJids = Array.from(new Set([input.contactJid, ...(input.aliasJids ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
  const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
  if (input.phoneE164) updates.phone_e164 = input.phoneE164;
  if (input.displayName) updates.display_name = input.displayName;
  if (input.notifyName) updates.notify_name = input.notifyName;
  if (input.verifiedName) updates.verified_name = input.verifiedName;
  if (input.avatarUrl !== undefined) {
    updates.avatar_url = input.avatarUrl;
    updates.avatar_fetched_at = trx.fn.now();
  }

  const existingRows = await trx("wa_contacts")
    .where({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId
    })
    .andWhere((builder) => {
      builder.whereIn("contact_jid", aliasJids);
      if (input.phoneE164) builder.orWhere("phone_e164", input.phoneE164);
    })
    .orderByRaw("case when contact_jid = ? then 0 else 1 end", [input.contactJid])
    .orderBy("updated_at", "desc")
    .select("*");

  let row: Record<string, unknown>;
  if (existingRows.length > 0) {
    const primary = existingRows[0] as Record<string, unknown>;
    const [updated] = await trx("wa_contacts")
      .where({ contact_id: primary.contact_id })
      .update(updates)
      .returning("*");
    row = updated as Record<string, unknown>;

    const duplicateIds = existingRows
      .slice(1)
      .map((item) => String(item.contact_id))
      .filter(Boolean);
    if (duplicateIds.length > 0) {
      await trx("wa_contacts").whereIn("contact_id", duplicateIds).delete();
    }
  } else {
    const [inserted] = await trx("wa_contacts")
      .insert({
        tenant_id: input.tenantId,
        wa_account_id: input.waAccountId,
        contact_jid: input.contactJid,
        phone_e164: input.phoneE164 ?? null,
        display_name: input.displayName ?? null,
        notify_name: input.notifyName ?? null,
        verified_name: input.verifiedName ?? null,
        avatar_url: input.avatarUrl ?? null,
        avatar_fetched_at: input.avatarUrl ? trx.fn.now() : null,
        is_wa_contact: true
      })
      .returning("*");
    row = inserted as Record<string, unknown>;
  }
  return row as Record<string, unknown>;
}

export async function listWaContacts(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; search?: string | null }
) {
  const query = trx("wa_contacts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .select("*");

  if (input.search) {
    const term = `%${input.search}%`;
    query.andWhere((b) => {
      b.whereILike("display_name", term)
        .orWhereILike("notify_name", term)
        .orWhereILike("phone_e164", term)
        .orWhereILike("contact_jid", term);
    });
  }

  const rows = await query
    .orderByRaw("coalesce(display_name, notify_name, phone_e164, contact_jid) asc");

  return rows.map((row) => ({
    contactId: String(row.contact_id),
    waAccountId: String(row.wa_account_id),
    contactJid: String(row.contact_jid),
    phoneE164: row.phone_e164 ? String(row.phone_e164) : null,
    displayName: row.display_name
      ? String(row.display_name)
      : (row.notify_name ? String(row.notify_name) : null),
    notifyName: row.notify_name ? String(row.notify_name) : null,
    verifiedName: row.verified_name ? String(row.verified_name) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  }));
}
