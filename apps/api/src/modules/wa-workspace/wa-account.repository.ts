/**
 * 作用:
 * - 封装 WA 账号、session、成员绑定、登录任务相关数据库访问。
 *
 * 交互:
 * - 被 wa-admin.service 与 wa-workbench.service 调用。
 * - 仅处理持久化，不做权限与业务编排。
 */
import type { Knex } from "knex";
import { deriveWaAccountStatus, deriveWaActions, deriveWaStatus, normalizeWaSessionSnapshot } from "./wa-session-status.js";

function parseSessionMeta(value: unknown): Record<string, unknown> | null {
  try {
    if (!value) return null;
    return typeof value === "string"
      ? JSON.parse(value) as Record<string, unknown>
      : value as Record<string, unknown>;
  } catch {
    return null;
  }
}

const LATEST_SESSION_ORDER_SQL = "coalesce(s.updated_at, s.heartbeat_at, s.created_at) desc, s.created_at desc";

function mapAccount(row: Record<string, unknown>) {
  const sessionMeta = parseSessionMeta(row.session_meta);
  const session = row.session_ref
    ? {
        sessionRef: String(row.session_ref),
        connectionState: row.session_connection_state ? String(row.session_connection_state) : "idle",
        loginMode: row.login_mode ? String(row.login_mode) : null,
        disconnectReason: row.session_disconnect_reason ? String(row.session_disconnect_reason) : null,
        loginPhase: typeof sessionMeta?.loginPhase === "string" ? sessionMeta.loginPhase : null,
        qrCodeAvailable: typeof sessionMeta?.qrCode === "string" && sessionMeta.qrCode.length > 0,
        heartbeatAt: row.session_heartbeat_at ? new Date(String(row.session_heartbeat_at)).toISOString() : null,
        historySyncedAt: typeof sessionMeta?.historySyncedAt === "string" ? sessionMeta.historySyncedAt : null,
        chatsSyncedAt: typeof sessionMeta?.chatsSyncedAt === "string" ? sessionMeta.chatsSyncedAt : null,
        groupsSyncedAt: typeof sessionMeta?.groupsSyncedAt === "string" ? sessionMeta.groupsSyncedAt : null,
        hasGroupChats: typeof sessionMeta?.hasGroupChats === "boolean" ? sessionMeta.hasGroupChats : null
      }
    : null;
  const normalizedSession = normalizeWaSessionSnapshot(session);
  const accountStatus = deriveWaAccountStatus({
    storedAccountStatus: String(row.account_status ?? "offline"),
    session: normalizedSession
  });
  const status = deriveWaStatus({
    accountStatus,
    session: normalizedSession
  });
  const lastConnectedAt = row.last_connected_at ? new Date(String(row.last_connected_at)).toISOString() : null;
  return {
    waAccountId: String(row.wa_account_id),
    instanceKey: String(row.instance_key),
    displayName: String(row.display_name),
    phoneE164: row.phone_e164 ? String(row.phone_e164) : null,
    providerKey: String(row.provider_key),
    accountStatus,
    riskLevel: String(row.risk_level),
    primaryOwnerMembershipId: row.primary_owner_membership_id ? String(row.primary_owner_membership_id) : null,
    primaryOwnerName: row.primary_owner_name ? String(row.primary_owner_name) : null,
    memberIds: Array.isArray(row.member_ids) ? row.member_ids.map((item) => String(item)) : [],
    memberCount: Number(row.member_count ?? 0),
    lastConnectedAt,
    lastDisconnectedAt: row.last_disconnected_at ? new Date(String(row.last_disconnected_at)).toISOString() : null,
    unreadMessageCount: Number(row.unread_message_count ?? 0),
    session: normalizedSession,
    status,
    actions: deriveWaActions({
      status,
      hasSession: Boolean(normalizedSession),
      lastConnectedAt,
      session: normalizedSession
    })
  };
}

async function loadWaAccounts(
  trx: Knex.Transaction,
  input: { tenantId: string; accountIds?: string[] }
) {
  const query = trx("wa_accounts as a")
    .leftJoin("tenant_memberships as owner", function joinOwner() {
      this.on("owner.membership_id", "=", "a.primary_owner_membership_id").andOn("owner.tenant_id", "=", "a.tenant_id");
    })
    .leftJoin("wa_account_members as wam", function joinMembers() {
      this.on("wam.wa_account_id", "=", "a.wa_account_id").andOn("wam.tenant_id", "=", "a.tenant_id");
    })
    .where("a.tenant_id", input.tenantId)
    .groupBy("a.wa_account_id", "owner.display_name")
    .select(
      "a.*",
      trx.raw("owner.display_name as primary_owner_name"),
      trx.raw(`(
        select s.session_ref
        from wa_account_sessions s
        where s.tenant_id = a.tenant_id
          and s.wa_account_id = a.wa_account_id
        order by ${LATEST_SESSION_ORDER_SQL}
        limit 1
      ) as session_ref`),
      trx.raw(`(
        select s.connection_state
        from wa_account_sessions s
        where s.tenant_id = a.tenant_id
          and s.wa_account_id = a.wa_account_id
        order by ${LATEST_SESSION_ORDER_SQL}
        limit 1
      ) as session_connection_state`),
      trx.raw(`(
        select s.heartbeat_at
        from wa_account_sessions s
        where s.tenant_id = a.tenant_id
          and s.wa_account_id = a.wa_account_id
        order by ${LATEST_SESSION_ORDER_SQL}
        limit 1
      ) as session_heartbeat_at`),
      trx.raw(`(
        select s.login_mode
        from wa_account_sessions s
        where s.tenant_id = a.tenant_id
          and s.wa_account_id = a.wa_account_id
        order by ${LATEST_SESSION_ORDER_SQL}
        limit 1
      ) as login_mode`),
      trx.raw(`(
        select s.disconnect_reason
        from wa_account_sessions s
        where s.tenant_id = a.tenant_id
          and s.wa_account_id = a.wa_account_id
        order by ${LATEST_SESSION_ORDER_SQL}
        limit 1
      ) as session_disconnect_reason`),
      trx.raw(`(
        select s.session_meta
        from wa_account_sessions s
        where s.tenant_id = a.tenant_id
          and s.wa_account_id = a.wa_account_id
        order by ${LATEST_SESSION_ORDER_SQL}
        limit 1
      ) as session_meta`),
      trx.raw(`(
        select coalesce(sum(c.unread_count), 0)
        from wa_conversations c
        where c.tenant_id = a.tenant_id
          and c.wa_account_id = a.wa_account_id
      ) as unread_message_count`),
      trx.raw("coalesce(json_agg(distinct wam.membership_id) filter (where wam.membership_id is not null), '[]'::json) as member_ids"),
      trx.raw("count(distinct wam.membership_id) as member_count")
    )
    .orderBy("a.created_at", "desc");

  if (input.accountIds && input.accountIds.length > 0) {
    query.whereIn("a.wa_account_id", input.accountIds);
  }

  const rows = await query;
  return rows.map((row) => mapAccount(row as Record<string, unknown>));
}

export async function insertWaAccount(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    instanceKey: string;
    displayName: string;
    phoneE164?: string | null;
    primaryOwnerMembershipId?: string | null;
  }
) {
  const [row] = await trx("wa_accounts")
    .insert({
      tenant_id: input.tenantId,
      instance_key: input.instanceKey,
      display_name: input.displayName,
      phone_e164: input.phoneE164 ?? null,
      primary_owner_membership_id: input.primaryOwnerMembershipId ?? null,
      provider_key: "baileys"
    })
    .returning("*");
  return mapAccount(row as Record<string, unknown>);
}

export async function listWaAccounts(trx: Knex.Transaction, tenantId: string) {
  return loadWaAccounts(trx, { tenantId });
}

export async function getWaAccountById(trx: Knex.Transaction, tenantId: string, waAccountId: string) {
  const rows = await loadWaAccounts(trx, { tenantId, accountIds: [waAccountId] });
  return rows[0] ?? null;
}

export async function upsertWaAccountSession(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    sessionRef: string;
    loginMode: string;
    connectionState: string;
    loginPhase?: string;
    qrCode?: string | null;
  }
) {
  const existing = await trx("wa_account_sessions")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .orderByRaw("coalesce(updated_at, heartbeat_at, created_at) desc, created_at desc")
    .first<Record<string, unknown> | undefined>();

  if (existing) {
    const [row] = await trx("wa_account_sessions")
      .where({ session_id: existing.session_id })
      .update({
        session_ref: input.sessionRef,
        session_provider: "baileys",
        login_mode: input.loginMode,
        connection_state: input.connectionState,
        last_qr_at: trx.fn.now(),
        session_meta: JSON.stringify({
          qrCode: input.qrCode ?? null,
          loginPhase: input.loginPhase ?? input.connectionState
        }),
        updated_at: trx.fn.now()
      })
      .returning("*");
    return row;
  }

  const [row] = await trx("wa_account_sessions")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      session_provider: "baileys",
      session_ref: input.sessionRef,
      login_mode: input.loginMode,
      connection_state: input.connectionState,
      last_qr_at: trx.fn.now(),
      session_meta: JSON.stringify({
        qrCode: input.qrCode ?? null,
        loginPhase: input.loginPhase ?? input.connectionState
      })
    })
    .returning("*");
  return row;
}

export async function createWaLoginTask(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    requestedByMembershipId: string;
    loginMode: string;
    sessionRef: string;
    qrCode: string;
    expiresAt: string;
  }
) {
  const [row] = await trx("wa_login_tasks")
    .insert({
      tenant_id: input.tenantId,
      wa_account_id: input.waAccountId,
      requested_by_membership_id: input.requestedByMembershipId,
      login_mode: input.loginMode,
      task_status: "pending",
      session_ref: input.sessionRef,
      qr_code: input.qrCode,
      expires_at: input.expiresAt
    })
    .returning("*");
  return row;
}

export async function replaceWaAccountMembers(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waAccountId: string;
    memberIds: string[];
  }
) {
  await trx("wa_account_members").where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId }).del();
  if (input.memberIds.length === 0) return [];
  const rows = input.memberIds.map((membershipId) => ({
    tenant_id: input.tenantId,
    wa_account_id: input.waAccountId,
    membership_id: membershipId
  }));
  return trx("wa_account_members").insert(rows).returning("*");
}

export async function updateWaAccountOwner(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; primaryOwnerMembershipId: string | null }
) {
  const [row] = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .update({
      primary_owner_membership_id: input.primaryOwnerMembershipId,
      updated_at: trx.fn.now()
    })
    .returning("*");
  return row ? mapAccount(row as Record<string, unknown>) : null;
}

export async function listAccessibleWaAccounts(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; includeAllForAdmins: boolean }
) {
  if (input.includeAllForAdmins) {
    return listWaAccounts(trx, input.tenantId);
  }

  const rows = await trx("wa_accounts as a")
    .where("a.tenant_id", input.tenantId)
    .leftJoin("wa_account_members as m", function joinMembers() {
      this.on("m.wa_account_id", "=", "a.wa_account_id").andOn("m.tenant_id", "=", "a.tenant_id");
    })
    .andWhere((builder) => {
      builder
        .where("a.primary_owner_membership_id", input.membershipId)
        .orWhere("m.membership_id", input.membershipId);
    })
    .groupBy("a.wa_account_id")
    .select("a.wa_account_id");

  const accountIds = rows.map((row) => String(row.wa_account_id));
  if (accountIds.length === 0) return [];
  return loadWaAccounts(trx, { tenantId: input.tenantId, accountIds });
}

export async function getAccessibleWaAccountUnreadSummary(
  trx: Knex.Transaction,
  input: { tenantId: string; membershipId: string; includeAllForAdmins: boolean }
) {
  const accounts = await listAccessibleWaAccounts(trx, input);
  if (accounts.length === 0) {
    return {
      accountCount: 0,
      totalUnreadMessages: 0
    };
  }

  const waAccountIds = accounts.map((account) => account.waAccountId);
  const row = await trx("wa_conversations")
    .where({ tenant_id: input.tenantId })
    .whereIn("wa_account_id", waAccountIds)
    .sum<{ total_unread_messages?: string | number | null }>("unread_count as total_unread_messages")
    .first();

  return {
    accountCount: waAccountIds.length,
    totalUnreadMessages: Number(row?.total_unread_messages ?? 0)
  };
}
