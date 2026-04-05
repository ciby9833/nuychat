/**
 * 作用:
 * - 处理 WA 会话“谁在回复”的排他控制。
 *
 * 交互:
 * - 被 wa-workbench.service 调用。
 * - 写入 wa_assignment_locks 与 wa_assignment_history，并同步会话当前负责人。
 */
import type { Knex } from "knex";

export async function takeOverWaConversation(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waConversationId: string;
    membershipId: string;
    actedByMembershipId: string;
    reason?: string | null;
    force?: boolean;
  }
) {
  const existing = await trx("wa_assignment_locks")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .first<Record<string, unknown> | undefined>();

  if (existing && !input.force && String(existing.active_membership_id) !== input.membershipId && String(existing.lock_status) === "active") {
    throw new Error("Conversation is currently owned by another member");
  }

  const previousMembershipId = existing?.active_membership_id ? String(existing.active_membership_id) : null;

  if (existing) {
    await trx("wa_assignment_locks")
      .where({ lock_id: existing.lock_id })
      .update({
        active_membership_id: input.membershipId,
        lock_status: input.force ? "forced_overridden" : "active",
        updated_by_membership_id: input.actedByMembershipId,
        updated_at: trx.fn.now()
      });
  } else {
    await trx("wa_assignment_locks").insert({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId,
      active_membership_id: input.membershipId,
      lock_status: "active",
      updated_by_membership_id: input.actedByMembershipId
    });
  }

  await trx("wa_conversations")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .update({
      current_replier_membership_id: input.membershipId,
      reply_lock_version: trx.raw("reply_lock_version + 1"),
      updated_at: trx.fn.now()
    });

  await trx("wa_assignment_history").insert({
    tenant_id: input.tenantId,
    wa_conversation_id: input.waConversationId,
    event_type: input.force ? "force_takeover" : "takeover",
    from_membership_id: previousMembershipId,
    to_membership_id: input.membershipId,
    acted_by_membership_id: input.actedByMembershipId,
    reason: input.reason ?? null
  });
}

export async function releaseWaConversation(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waConversationId: string;
    membershipId: string;
    reason?: string | null;
    force?: boolean;
  }
) {
  const existing = await trx("wa_assignment_locks")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .first<Record<string, unknown> | undefined>();

  if (!existing) return;
  const activeMembershipId = String(existing.active_membership_id);
  if (!input.force && activeMembershipId !== input.membershipId) {
    throw new Error("Only current owner can release this conversation");
  }

  await trx("wa_assignment_locks")
    .where({ lock_id: existing.lock_id })
    .update({
      lock_status: "released",
      updated_by_membership_id: input.membershipId,
      updated_at: trx.fn.now()
    });

  await trx("wa_conversations")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .update({
      current_replier_membership_id: null,
      reply_lock_version: trx.raw("reply_lock_version + 1"),
      updated_at: trx.fn.now()
    });

  await trx("wa_assignment_history").insert({
    tenant_id: input.tenantId,
    wa_conversation_id: input.waConversationId,
    event_type: "release",
    from_membership_id: activeMembershipId,
    acted_by_membership_id: input.membershipId,
    reason: input.reason ?? null
  });
}

export async function assertCanReplyToWaConversation(
  trx: Knex.Transaction,
  input: { tenantId: string; waConversationId: string; membershipId: string }
) {
  const row = await trx("wa_conversations")
    .where({ tenant_id: input.tenantId, wa_conversation_id: input.waConversationId })
    .select("current_replier_membership_id")
    .first<{ current_replier_membership_id: string | null } | undefined>();
  if (!row) {
    throw new Error("Conversation not found");
  }
  if (row.current_replier_membership_id && row.current_replier_membership_id !== input.membershipId) {
    throw new Error("Conversation is currently assigned to another member");
  }
}
