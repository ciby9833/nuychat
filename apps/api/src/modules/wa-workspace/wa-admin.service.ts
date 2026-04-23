/**
 * 作用:
 * - 承载 WA 后台管理侧的业务编排。
 *
 * 交互:
 * - 依赖 wa-account.repository 管理账号与登录任务。
 * - 依赖当前唯一的 Baileys adapter 处理登录与重连。
 */
import type { Knex } from "knex";

import { normalizeNonEmptyString } from "../tenant/tenant-admin.shared.js";
import { waProviderAdapter } from "./provider/provider-registry.js";
import { deriveWaAccountStatus, deriveWaActions, deriveWaStatus, normalizeWaSessionSnapshot } from "./wa-session-status.js";
import {
  createWaLoginTask,
  getWaAccountById,
  insertWaAccount,
  listWaAccounts,
  replaceWaAccountMembers,
  updateWaAccountOwner,
  upsertWaAccountSession
} from "./wa-account.repository.js";

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

function buildInstanceKey(displayName: string) {
  return `wa-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "account"}`;
}

export async function listAdminWaAccounts(trx: Knex.Transaction, tenantId: string) {
  return listWaAccounts(trx, tenantId);
}

export async function createAdminWaAccount(
  trx: Knex.Transaction,
  input: { tenantId: string; displayName: string; phoneE164?: string | null; primaryOwnerMembershipId?: string | null }
) {
  const instanceKey = buildInstanceKey(input.displayName);
  return insertWaAccount(trx, {
    tenantId: input.tenantId,
    instanceKey,
    displayName: input.displayName,
    phoneE164: normalizeNonEmptyString(input.phoneE164),
    primaryOwnerMembershipId: input.primaryOwnerMembershipId ?? null
  });
}

export async function createAdminLoginTask(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; membershipId: string; loginMode: string }
) {
  const account = await getWaAccountById(trx, input.tenantId, input.waAccountId);
  if (!account) {
    throw new Error("WA account not found");
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
    loginMode: input.loginMode,
    connectionState: ticket.connectionState,
    loginPhase: ticket.loginPhase,
    qrCode: ticket.qrCode
  });

  const row = await createWaLoginTask(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    requestedByMembershipId: input.membershipId,
    loginMode: input.loginMode,
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
        loginMode: input.loginMode,
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

export async function assignAdminWaAccountMembers(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; memberIds: string[] }
) {
  return replaceWaAccountMembers(trx, input);
}

export async function updateAdminWaAccountOwner(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; primaryOwnerMembershipId: string | null }
) {
  return updateWaAccountOwner(trx, input);
}

export async function getAdminWaAccountHealth(trx: Knex.Transaction, tenantId: string, waAccountId: string) {
  const account = await trx("wa_accounts").where({ tenant_id: tenantId, wa_account_id: waAccountId }).first();
  if (!account) throw new Error("WA account not found");
  const session = await trx("wa_account_sessions")
    .where({ tenant_id: tenantId, wa_account_id: waAccountId })
    .orderByRaw("coalesce(updated_at, heartbeat_at, created_at) desc, created_at desc")
    .first();
  const meta = session ? parseSessionMeta(session.session_meta) : null;
  const rawSessionSummary = session
    ? {
        connectionState: String(session.connection_state),
        loginMode: session.login_mode ? String(session.login_mode) : null,
        loginPhase: typeof meta?.loginPhase === "string" ? meta.loginPhase : null,
        disconnectReason: session.disconnect_reason ? String(session.disconnect_reason) : null,
        qrCodeAvailable: typeof meta?.qrCode === "string" && meta.qrCode.length > 0,
        heartbeatAt: session.heartbeat_at ? new Date(session.heartbeat_at).toISOString() : null,
        historySyncedAt: typeof meta?.historySyncedAt === "string" ? meta.historySyncedAt : null,
        chatsSyncedAt: typeof meta?.chatsSyncedAt === "string" ? meta.chatsSyncedAt : null,
        groupsSyncedAt: typeof meta?.groupsSyncedAt === "string" ? meta.groupsSyncedAt : null,
        hasGroupChats: typeof meta?.hasGroupChats === "boolean" ? meta.hasGroupChats : null
      }
    : null;
  const sessionSummary = normalizeWaSessionSnapshot(rawSessionSummary);
  const sessionView = session
    ? {
        ...(meta ?? {}),
        connectionState: session.connection_state,
        sessionRef: session.session_ref,
        loginMode: session.login_mode,
        loginPhase: sessionSummary?.loginPhase ?? (typeof meta?.loginPhase === "string" ? meta.loginPhase : null),
        heartbeatAt: session.heartbeat_at ? new Date(session.heartbeat_at).toISOString() : null,
        disconnectReason: session.disconnect_reason ?? null,
        autoReconnectCount: Number(session.auto_reconnect_count ?? 0),
        qrCode: typeof meta?.qrCode === "string" ? meta.qrCode : null,
        isOnline: typeof meta?.isOnline === "boolean" ? meta.isOnline : sessionSummary?.connectionState === "open",
        phoneConnected: typeof meta?.phoneConnected === "boolean"
          ? meta.phoneConnected
          : (sessionSummary?.connectionState === "open" ? true : null),
        receivedPendingNotifications: typeof meta?.receivedPendingNotifications === "boolean"
          ? meta.receivedPendingNotifications
          : (sessionSummary?.loginPhase === "connected" ? true : null)
      }
    : null;
  const lastConnectedAt = account.last_connected_at ? new Date(account.last_connected_at).toISOString() : null;
  const effectiveAccountStatus = deriveWaAccountStatus({
    storedAccountStatus: String(account.account_status ?? "offline"),
    session: sessionSummary
  });
  const status = deriveWaStatus({
    accountStatus: effectiveAccountStatus,
    session: sessionSummary
  });
  return {
    waAccountId,
    providerKey: account.provider_key,
    lastConnectedAt: account.last_connected_at ? new Date(account.last_connected_at).toISOString() : null,
    lastDisconnectedAt: account.last_disconnected_at ? new Date(account.last_disconnected_at).toISOString() : null,
    session: sessionView,
    status,
    actions: deriveWaActions({
      status,
      hasSession: Boolean(sessionSummary),
      lastConnectedAt,
      session: sessionSummary
    })
  };
}

export async function reconnectAdminWaAccount(trx: Knex.Transaction, input: { tenantId: string; waAccountId: string }) {
  const account = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .first<Record<string, unknown> | undefined>();
  if (!account) throw new Error("WA account not found");
  if (!account.last_connected_at) {
    throw new Error("WA account has never connected. Please complete QR login first");
  }

  const result = await waProviderAdapter.restartSession({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    instanceKey: String(account.instance_key)
  });

  await trx("wa_account_sessions")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .update({
      connection_state: result.connectionState,
      auto_reconnect_count: trx.raw("auto_reconnect_count + 1"),
      updated_at: trx.fn.now()
    });

  await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .update({
      account_status: result.connectionState === "open" ? "online" : "offline",
      updated_at: trx.fn.now()
    });

  return { accepted: true, connectionState: result.connectionState };
}

export async function logoutAdminWaAccount(trx: Knex.Transaction, input: { tenantId: string; waAccountId: string }) {
  const account = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .first<Record<string, unknown> | undefined>();
  if (!account) throw new Error("WA account not found");

  await waProviderAdapter.logoutSession({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    instanceKey: String(account.instance_key)
  });

  return { accepted: true };
}

export async function deleteAdminWaAccount(trx: Knex.Transaction, input: { tenantId: string; waAccountId: string }) {
  const account = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .first<Record<string, unknown> | undefined>();
  if (!account) throw new Error("WA account not found");

  // If there's a live session, logout first to clean up the Baileys runtime
  const session = await trx("wa_account_sessions")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .first<Record<string, unknown> | undefined>();
  if (session && String(session.connection_state) !== "close") {
    try {
      await waProviderAdapter.logoutSession({
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        instanceKey: String(account.instance_key)
      });
    } catch {
      // ignore logout errors during deletion — the DB cascade will clean up
    }
  }

  // CASCADE deletes sessions, members, login_tasks, conversations, messages, etc.
  const deleted = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .del();
  if (!deleted) throw new Error("WA account not found");

  return { deleted: true };
}
