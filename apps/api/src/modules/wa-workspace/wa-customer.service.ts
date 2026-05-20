/**
 * 作用:
 * - 客户档案的 CRUD、JID 绑定、以及按客户维度的回复统计聚合。
 *
 * 交互:
 * - 被 wa-workbench.routes 调用，提供客户管理与报表 API。
 * - 绑定 JID 后同步回填 wa_conversation_reply_facts.customer_participant_jid。
 */
import type { Knex } from "knex";

import { db, withTenantTransaction } from "../../infra/db/client.js";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  try { return new Date(value as string).toISOString(); } catch { return null; }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type WaCustomerContactRow = {
  waCustomerContactId: string;
  displayName: string;
  remarks: string | null;
  externalCustomerId: string | null;
  customerStatus: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WaCustomerStats = WaCustomerContactRow & {
  totalMessages: number;
  requiresReplyCount: number;
  repliedCount: number;
  pendingCount: number;
  replyRate: number | null;
  avgReplyDurationSec: number | null;
  lastMessageAt: string | null;
  // per-conversation breakdown (simplified: top 5 most active)
  conversations: Array<{
    waConversationId: string;
    subject: string | null;
    messageCount: number;
  }>;
};

export type WaCustomerBinding = {
  bindingId: string;
  waCustomerContactId: string;
  participantJid: string;
  bindingRemarks: string | null;
  sourceConversationId: string | null;
  createdAt: string;
};

// ─── List & Search ───────────────────────────────────────────────────────────

export async function listWaCustomerContacts(input: {
  tenantId: string;
  status?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: WaCustomerContactRow[]; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 50, 200));
  const offset = (page - 1) * pageSize;

  let query = db("wa_customer_contacts as c")
    .where("c.tenant_id", input.tenantId)
    .where("c.customer_status", input.status ?? "active")
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "c.owner_membership_id")
    .select(
      "c.wa_customer_contact_id",
      "c.display_name",
      "c.remarks",
      "c.external_customer_id",
      "c.customer_status",
      "c.owner_membership_id",
      db.raw("tm.display_name as owner_name"),
      "c.created_at",
      "c.updated_at"
    );

  if (input.search) {
    const like = `%${input.search}%`;
    query = query.where((q) => {
      void q.whereILike("c.display_name", like).orWhereILike("c.remarks", like);
    });
  }

  const countQuery = query.clone().clearSelect().clearOrder().count("c.wa_customer_contact_id as n");
  const [rows, countResult] = await Promise.all([
    query.orderBy("c.display_name", "asc").limit(pageSize).offset(offset),
    countQuery
  ]);
  const total = Number((countResult as Array<Record<string, unknown>>)[0]?.n ?? 0);

  return {
    rows: (rows as Array<Record<string, unknown>>).map(mapContactRow),
    total
  };
}

function mapContactRow(row: Record<string, unknown>): WaCustomerContactRow {
  return {
    waCustomerContactId: String(row.wa_customer_contact_id),
    displayName: String(row.display_name),
    remarks: asString(row.remarks),
    externalCustomerId: asString(row.external_customer_id),
    customerStatus: String(row.customer_status ?? "active"),
    ownerMembershipId: asString(row.owner_membership_id),
    ownerName: asString(row.owner_name),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? ""
  };
}

// ─── Upsert / Update ─────────────────────────────────────────────────────────

export async function createWaCustomerContact(input: {
  tenantId: string;
  membershipId: string;
  displayName: string;
  remarks?: string | null;
  ownerMembershipId?: string | null;
  externalCustomerId?: string | null;
}): Promise<WaCustomerContactRow> {
  const [row] = await db("wa_customer_contacts")
    .insert({
      tenant_id: input.tenantId,
      display_name: input.displayName.trim(),
      remarks: input.remarks ?? null,
      owner_membership_id: input.ownerMembershipId ?? null,
      external_customer_id: input.externalCustomerId ?? null,
      created_by_membership_id: input.membershipId,
      customer_status: "active"
    })
    .returning("*");
  return getCustomerContactById({ tenantId: input.tenantId, waCustomerContactId: String((row as Record<string,unknown>).wa_customer_contact_id) })
    .then((c) => { if (!c) throw new Error("not found after insert"); return c; });
}

export async function updateWaCustomerContact(input: {
  tenantId: string;
  waCustomerContactId: string;
  displayName?: string | null;
  remarks?: string | null;
  ownerMembershipId?: string | null;
  customerStatus?: string | null;
}): Promise<WaCustomerContactRow | null> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (input.displayName != null) patch.display_name = input.displayName.trim();
  if (input.remarks !== undefined) patch.remarks = input.remarks ?? null;
  if (input.ownerMembershipId !== undefined) patch.owner_membership_id = input.ownerMembershipId ?? null;
  if (input.customerStatus) patch.customer_status = input.customerStatus;

  await db("wa_customer_contacts")
    .where({ tenant_id: input.tenantId, wa_customer_contact_id: input.waCustomerContactId })
    .update(patch);
  return getCustomerContactById({ tenantId: input.tenantId, waCustomerContactId: input.waCustomerContactId });
}

export async function getCustomerContactById(input: {
  tenantId: string;
  waCustomerContactId: string;
}): Promise<WaCustomerContactRow | null> {
  const row = await db("wa_customer_contacts as c")
    .where("c.tenant_id", input.tenantId)
    .where("c.wa_customer_contact_id", input.waCustomerContactId)
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "c.owner_membership_id")
    .select(
      "c.wa_customer_contact_id",
      "c.display_name",
      "c.remarks",
      "c.external_customer_id",
      "c.customer_status",
      "c.owner_membership_id",
      db.raw("tm.display_name as owner_name"),
      "c.created_at",
      "c.updated_at"
    )
    .first<Record<string, unknown> | undefined>();
  return row ? mapContactRow(row) : null;
}

// ─── JID Binding ─────────────────────────────────────────────────────────────

/**
 * 绑定 JID 到客户，同时可选地传入 customerName 以自动新建客户档案。
 *
 * - 若提供 waCustomerContactId → 直接绑定
 * - 若提供 customerName 但没有 ID → 先创建客户档案再绑定
 * - 同一 JID 已绑定到其他客户 → 先解绑旧绑定再重新绑定
 */
export async function bindJidToCustomer(input: {
  tenantId: string;
  membershipId: string;
  participantJid: string;
  waCustomerContactId?: string | null;
  customerName?: string | null;
  ownerMembershipId?: string | null;
  bindingRemarks?: string | null;
  sourceConversationId?: string | null;
}): Promise<{ customer: WaCustomerContactRow; binding: WaCustomerBinding }> {
  return withTenantTransaction(input.tenantId, async (trx) => {
    // Resolve or create customer profile
    let customerId = input.waCustomerContactId ?? null;
    if (!customerId && input.customerName?.trim()) {
      const [newRow] = await trx("wa_customer_contacts")
        .insert({
          tenant_id: input.tenantId,
          display_name: input.customerName.trim(),
          owner_membership_id: input.ownerMembershipId ?? null,
          created_by_membership_id: input.membershipId,
          customer_status: "active"
        })
        .returning("wa_customer_contact_id");
      customerId = String((newRow as Record<string,unknown>).wa_customer_contact_id);
    }
    if (!customerId) throw new Error("waCustomerContactId or customerName is required");

    // Upsert the binding (delete old one if JID was previously bound to someone else)
    await trx("wa_customer_jid_bindings")
      .where({ tenant_id: input.tenantId, participant_jid: input.participantJid })
      .delete();

    const [bindingRow] = await trx("wa_customer_jid_bindings")
      .insert({
        tenant_id: input.tenantId,
        wa_customer_contact_id: customerId,
        participant_jid: input.participantJid,
        source_wa_conversation_id: input.sourceConversationId ?? null,
        binding_remarks: input.bindingRemarks ?? null,
        created_by_membership_id: input.membershipId
      })
      .returning("*");

    // Back-fill customer_participant_jid on existing reply_facts for this JID
    await trx("wa_conversation_reply_facts")
      .where({ tenant_id: input.tenantId })
      .whereNull("customer_participant_jid")
      .whereExists(
        trx("wa_messages")
          .where({ tenant_id: input.tenantId })
          .whereRaw("wa_messages.wa_message_id = wa_conversation_reply_facts.source_wa_message_id")
          .where((q) => {
            void q.where("wa_messages.participant_jid", input.participantJid)
              .orWhere("wa_messages.sender_jid", input.participantJid);
          })
          .select(trx.raw("1"))
      )
      .update({ customer_participant_jid: input.participantJid });

    const customer = await trx("wa_customer_contacts as c")
      .where("c.tenant_id", input.tenantId)
      .where("c.wa_customer_contact_id", customerId)
      .leftJoin("tenant_memberships as tm", "tm.membership_id", "c.owner_membership_id")
      .select("c.*", db.raw("tm.display_name as owner_name"))
      .first<Record<string, unknown>>();

    return {
      customer: mapContactRow(customer),
      binding: mapBindingRow(bindingRow as Record<string, unknown>)
    };
  });
}

export async function unbindJid(input: {
  tenantId: string;
  participantJid: string;
}): Promise<{ deleted: boolean }> {
  const count = await db("wa_customer_jid_bindings")
    .where({ tenant_id: input.tenantId, participant_jid: input.participantJid })
    .delete();
  return { deleted: Number(count) > 0 };
}

export async function listBindingsForCustomer(input: {
  tenantId: string;
  waCustomerContactId: string;
}): Promise<WaCustomerBinding[]> {
  const rows = await db("wa_customer_jid_bindings")
    .where({ tenant_id: input.tenantId, wa_customer_contact_id: input.waCustomerContactId })
    .orderBy("created_at", "asc");
  return (rows as Array<Record<string, unknown>>).map(mapBindingRow);
}

function mapBindingRow(row: Record<string, unknown>): WaCustomerBinding {
  return {
    bindingId: String(row.binding_id),
    waCustomerContactId: String(row.wa_customer_contact_id),
    participantJid: String(row.participant_jid),
    bindingRemarks: asString(row.binding_remarks),
    sourceConversationId: asString(row.source_wa_conversation_id),
    createdAt: toIso(row.created_at) ?? ""
  };
}

// ─── Group Members with Binding Info ─────────────────────────────────────────

export async function getGroupMembersWithBindings(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string }
): Promise<Array<{
  memberRowId: string;
  participantJid: string;
  displayName: string | null;
  phoneE164: string | null;
  isAdmin: boolean;
  customerContactId: string | null;
  customerName: string | null;
  ownerMembershipId: string | null;
  ownerName: string | null;
  bindingRemarks: string | null;
}>> {
  const rows = await trx("wa_conversation_members as m")
    .where("m.tenant_id", input.tenantId)
    .where("m.wa_conversation_id", input.waConversationId)
    .leftJoin("wa_customer_jid_bindings as b", (q) =>
      q.on("b.participant_jid", "m.participant_jid").andOn("b.tenant_id", "m.tenant_id")
    )
    .leftJoin("wa_customer_contacts as c", "c.wa_customer_contact_id", "b.wa_customer_contact_id")
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "c.owner_membership_id")
    .select(
      "m.member_row_id",
      "m.participant_jid",
      "m.display_name",
      "m.is_admin",
      "c.wa_customer_contact_id",
      "c.display_name as customer_name",
      "c.owner_membership_id",
      db.raw("tm.display_name as owner_name"),
      "b.binding_remarks"
    )
    .orderBy("m.joined_at", "asc");

  return (rows as Array<Record<string, unknown>>).map((row) => {
    const jid = String(row.participant_jid);
    const local = jid.split("@")[0] ?? "";
    const phoneE164 = /^[0-9]+$/.test(local) && jid.endsWith("@s.whatsapp.net")
      ? `+${local}` : null;
    return {
      memberRowId: String(row.member_row_id),
      participantJid: jid,
      displayName: asString(row.display_name),
      phoneE164,
      isAdmin: Boolean(row.is_admin),
      customerContactId: asString(row.wa_customer_contact_id),
      customerName: asString(row.customer_name),
      ownerMembershipId: asString(row.owner_membership_id),
      ownerName: asString(row.owner_name),
      bindingRemarks: asString(row.binding_remarks)
    };
  });
}

// ─── Customer Report / Stats ──────────────────────────────────────────────────

export async function getCustomerReportStats(input: {
  tenantId: string;
  waAccountId?: string | null;
  ownerMembershipId?: string | null;
  startAt: Date;
  endAt: Date;
}): Promise<WaCustomerStats[]> {
  // Main aggregate: messages + reply facts
  const statsRows = await db("wa_customer_contacts as c")
    .where("c.tenant_id", input.tenantId)
    .where("c.customer_status", "active")
    .leftJoin("tenant_memberships as tm", "tm.membership_id", "c.owner_membership_id")
    .leftJoin("wa_customer_jid_bindings as b", (q) =>
      q.on("b.wa_customer_contact_id", "c.wa_customer_contact_id")
        .andOn("b.tenant_id", "c.tenant_id")
    )
    .leftJoin("wa_messages as m", (q) =>
      q.on("m.tenant_id", "c.tenant_id")
        .on((inner) =>
          inner.on("m.participant_jid", "b.participant_jid")
            .orOn("m.sender_jid", "b.participant_jid")
        )
        .andOnVal("m.direction", "inbound")
        .andOnBetween("m.server_received_at", [input.startAt.toISOString(), input.endAt.toISOString()])
    )
    .leftJoin("wa_conversation_reply_facts as rf", (q) =>
      q.on("rf.source_wa_message_id", "m.wa_message_id")
        .andOn("rf.tenant_id", "m.tenant_id")
    )
    .modify((q) => {
      if (input.waAccountId) q.andWhere("c.tenant_id", input.tenantId); // already filtered above; add account filter
      if (input.ownerMembershipId) void q.where("c.owner_membership_id", input.ownerMembershipId);
    })
    .groupBy("c.wa_customer_contact_id", "c.display_name", "c.remarks",
      "c.external_customer_id", "c.customer_status", "c.owner_membership_id",
      "tm.display_name", "c.created_at", "c.updated_at")
    .select(
      "c.wa_customer_contact_id",
      "c.display_name",
      "c.remarks",
      "c.external_customer_id",
      "c.customer_status",
      "c.owner_membership_id",
      db.raw("tm.display_name as owner_name"),
      "c.created_at",
      "c.updated_at",
      db.raw("COUNT(DISTINCT m.wa_message_id) as total_messages"),
      db.raw("COUNT(DISTINCT rf.fact_id) FILTER (WHERE rf.requires_reply) as requires_reply_count"),
      db.raw("COUNT(DISTINCT rf.fact_id) FILTER (WHERE rf.requires_reply AND rf.first_reply_at IS NOT NULL) as replied_count"),
      db.raw("COUNT(DISTINCT rf.fact_id) FILTER (WHERE rf.requires_reply AND rf.first_reply_at IS NULL) as pending_count"),
      db.raw("ROUND(AVG(rf.reply_duration_sec) FILTER (WHERE rf.reply_duration_sec > 0))::int as avg_reply_sec"),
      db.raw(`MAX(m.server_received_at) FILTER (WHERE m.direction = 'inbound') as last_message_at`)
    )
    .orderByRaw("MAX(m.server_received_at) DESC NULLS LAST");

  // Conversation breakdown per customer (top 5 most active)
  const allCustomerIds = (statsRows as Array<Record<string, unknown>>)
    .map((r) => String(r.wa_customer_contact_id));

  const breakdownRows = allCustomerIds.length === 0
    ? []
    : await db("wa_customer_contacts as c")
        .where("c.tenant_id", input.tenantId)
        .whereIn("c.wa_customer_contact_id", allCustomerIds)
        .join("wa_customer_jid_bindings as b", (q) =>
          q.on("b.wa_customer_contact_id", "c.wa_customer_contact_id")
            .andOn("b.tenant_id", "c.tenant_id")
        )
        .join("wa_messages as m", (q) =>
          q.on((inner) =>
            inner.on("m.participant_jid", "b.participant_jid")
              .orOn("m.sender_jid", "b.participant_jid")
          )
          .andOn("m.tenant_id", "c.tenant_id")
          .andOnVal("m.direction", "inbound")
          .andOnBetween("m.server_received_at", [input.startAt.toISOString(), input.endAt.toISOString()])
        )
        .join("wa_conversations as conv", "conv.wa_conversation_id", "m.wa_conversation_id")
        .groupBy("c.wa_customer_contact_id", "conv.wa_conversation_id", "conv.subject")
        .select(
          "c.wa_customer_contact_id",
          "conv.wa_conversation_id",
          "conv.subject",
          db.raw("COUNT(DISTINCT m.wa_message_id) as msg_count")
        )
        .orderByRaw("COUNT(DISTINCT m.wa_message_id) DESC");

  const breakdownByCustomer = new Map<string, WaCustomerStats["conversations"]>();
  for (const row of breakdownRows as Array<Record<string, unknown>>) {
    const cid = String(row.wa_customer_contact_id);
    if (!breakdownByCustomer.has(cid)) breakdownByCustomer.set(cid, []);
    const arr = breakdownByCustomer.get(cid)!;
    if (arr.length < 5) {
      arr.push({
        waConversationId: String(row.wa_conversation_id),
        subject: asString(row.subject),
        messageCount: Number(row.msg_count)
      });
    }
  }

  return (statsRows as Array<Record<string, unknown>>).map((row) => {
    const cid = String(row.wa_customer_contact_id);
    const requiresReply = Number(row.requires_reply_count ?? 0);
    const replied = Number(row.replied_count ?? 0);
    return {
      ...mapContactRow(row),
      totalMessages: Number(row.total_messages ?? 0),
      requiresReplyCount: requiresReply,
      repliedCount: replied,
      pendingCount: Number(row.pending_count ?? 0),
      replyRate: requiresReply > 0 ? Math.round((replied / requiresReply) * 100) / 100 : null,
      avgReplyDurationSec: row.avg_reply_sec != null ? Number(row.avg_reply_sec) : null,
      lastMessageAt: toIso(row.last_message_at),
      conversations: breakdownByCustomer.get(cid) ?? []
    };
  });
}

// ─── Team Members (for owner/sales picker) ───────────────────────────────────

export async function listWaTeamMembers(tenantId: string): Promise<Array<{
  membershipId: string;
  displayName: string | null;
  role: string;
}>> {
  const rows = await db("tenant_memberships")
    .where({ tenant_id: tenantId })
    .whereIn("status", ["active", "invited"])
    .select("membership_id", "display_name", "role")
    .orderBy("display_name", "asc");
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    membershipId: String(row.membership_id),
    displayName: asString(row.display_name),
    role: String(row.role ?? "")
  }));
}

// ─── Fill customer_participant_jid when new reply facts are created ───────────
// Called from wa-monitor.service after inserting a reply fact.

export async function fillCustomerJidOnReplyFact(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    factId: string;
    sourceWaMessageId: string;
  }
): Promise<void> {
  // Find the participant/sender jid for this message
  const msgRow = await trx("wa_messages")
    .where({ tenant_id: input.tenantId, wa_message_id: input.sourceWaMessageId })
    .select("participant_jid", "sender_jid", "direction")
    .first<Record<string, unknown> | undefined>();
  if (!msgRow) return;

  const senderJid = asString(msgRow.participant_jid) ?? asString(msgRow.sender_jid);
  if (!senderJid) return;

  await trx("wa_conversation_reply_facts")
    .where({ tenant_id: input.tenantId, fact_id: input.factId })
    .whereNull("customer_participant_jid")
    .update({ customer_participant_jid: senderJid });
}
