/**
 * 作用:
 * - 承载 WA 后台管理侧的业务编排。
 *
 * 交互:
 * - 依赖 wa-account.repository 管理账号与登录任务。
 * - 依赖 provider-registry 获取 provider 登录 ticket。
 */
import type { Knex } from "knex";

import { normalizeNonEmptyString } from "../tenant/tenant-admin.shared.js";
import { getWaProviderAdapter } from "./provider/provider-registry.js";
import {
  createWaLoginTask,
  getWaAccountById,
  insertWaAccount,
  listWaAccounts,
  replaceWaAccountMembers,
  updateWaAccountOwner,
  upsertWaAccountSession
} from "./wa-account.repository.js";

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

  const provider = getWaProviderAdapter(account.providerKey);
  const ticket = await provider.createLoginTicket({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    instanceKey: account.instanceKey
  });

  await upsertWaAccountSession(trx, {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    sessionRef: ticket.sessionRef,
    loginMode: input.loginMode,
    connectionState: "qr_required",
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
    qrCode: String(row.qr_code),
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
    .orderBy("created_at", "desc")
    .first();
  return {
    waAccountId,
    accountStatus: account.account_status,
    providerKey: account.provider_key,
    lastConnectedAt: account.last_connected_at ? new Date(account.last_connected_at).toISOString() : null,
    lastDisconnectedAt: account.last_disconnected_at ? new Date(account.last_disconnected_at).toISOString() : null,
    session: session
      ? {
          connectionState: session.connection_state,
          sessionRef: session.session_ref,
          loginMode: session.login_mode,
          heartbeatAt: session.heartbeat_at ? new Date(session.heartbeat_at).toISOString() : null,
          disconnectReason: session.disconnect_reason ?? null,
          autoReconnectCount: Number(session.auto_reconnect_count ?? 0)
        }
      : null
  };
}

export async function reconnectAdminWaAccount(trx: Knex.Transaction, input: { tenantId: string; waAccountId: string }) {
  const account = await trx("wa_accounts")
    .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId })
    .first<Record<string, unknown> | undefined>();
  if (!account) throw new Error("WA account not found");

  const provider = getWaProviderAdapter(String(account.provider_key));
  const result = await provider.restartSession({ instanceKey: String(account.instance_key) });

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
