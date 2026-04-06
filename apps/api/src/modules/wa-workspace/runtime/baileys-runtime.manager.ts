/**
 * 作用:
 * - 管理 WA 号码对应的 Baileys socket 运行时。
 *
 * 交互:
 * - 被 admin/workbench 登录任务与重连逻辑调用。
 * - 在 `connection.update` / `creds.update` 时回写 session 与账号状态。
 */
import crypto from "node:crypto";

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type AuthenticationCreds,
  type ConnectionState
} from "@whiskeysockets/baileys";
import { withTenantTransaction } from "../../../infra/db/client.js";
import { ingestBaileysMessagesUpdate, ingestBaileysMessagesUpsert } from "../wa-baileys-event.service.js";
import {
  ingestBaileysChatsUpdate,
  ingestBaileysGroupParticipantsUpdate,
  ingestBaileysGroupsUpdate,
  ingestBaileysHistorySet
} from "../wa-baileys-sync.service.js";
import { ingestBaileysMessageReceipts } from "../wa-baileys-receipt.service.js";
import { emitWaAccountUpdated } from "../wa-realtime.service.js";
import { createBaileysAuthState, persistBaileysAuthSnapshot } from "./baileys-auth.repository.js";
import { getBaileysRuntimeConfig } from "./baileys-config.js";
import { mapBaileysMessageToInbound } from "./baileys-message.mapper.js";

type RuntimeEntry = {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  socket: ReturnType<typeof makeWASocket>;
  sessionRef: string;
  qrCode: string | null;
  connectionState: string;
  loginPhase: string;
  lastDisconnectReason: string | null;
  activeLoginMode: string;
  isOnline: boolean | null;
  phoneConnected: boolean | null;
  receivedPendingNotifications: boolean | null;
  restartRequested: boolean;
  recentHistory: Map<string, ReturnType<typeof mapBaileysMessageToInbound>[]>;
};

type LoginTicket = {
  sessionRef: string;
  qrCode: string;
  expiresAt: string;
};

const runtimes = new Map<string, RuntimeEntry>();

function runtimeKey(tenantId: string, waAccountId: string) {
  return `${tenantId}:${waAccountId}`;
}

function mapConnectionState(update: Partial<ConnectionState>): string {
  if (update.qr) return "qr_required";
  if (update.connection === "open") return "open";
  if (update.connection === "connecting") return "connecting";
  if (update.connection === "close") return "close";
  return "idle";
}

function deriveLoginPhase(
  update: Partial<ConnectionState>,
  previous: Pick<RuntimeEntry, "qrCode" | "loginPhase" | "receivedPendingNotifications">
): string {
  if (typeof update.qr === "string" && update.qr.length > 0) return "qr_required";
  if (update.isNewLogin) return "syncing";
  if (update.connection === "close") return "failed";
  if (update.connection === "open") {
    if (update.receivedPendingNotifications === true) return "connected";
    return "syncing";
  }
  if (update.connection === "connecting") {
    if (previous.qrCode || previous.loginPhase === "qr_required") return "qr_scanned";
    return "connecting";
  }
  if (previous.receivedPendingNotifications === true) return "connected";
  return previous.loginPhase || "idle";
}

async function persistSessionState(
  tenantId: string,
  waAccountId: string,
  input: {
    sessionRef: string;
    connectionState: string;
    loginPhase: string;
    loginMode: string;
    qrCode?: string | null;
    disconnectReason?: string | null;
    isOnline?: boolean | null;
    phoneConnected?: boolean | null;
    receivedPendingNotifications?: boolean | null;
  }
) {
  const occurredAt = new Date().toISOString();
  const accountStatus =
    input.loginPhase === "connected" ? "online" :
    input.loginPhase === "qr_required" || input.loginPhase === "qr_scanned" || input.loginPhase === "syncing" || input.loginPhase === "connecting" ? "pending_login" :
    "offline";

  await withTenantTransaction(tenantId, async (trx) => {
    const existing = await trx("wa_account_sessions")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .orderBy("created_at", "desc")
      .first<Record<string, unknown> | undefined>();

    const sessionMeta = {
      loginPhase: input.loginPhase,
      qrCode: input.qrCode ?? null,
      disconnectReason: input.disconnectReason ?? null,
      isOnline: input.isOnline ?? null,
      phoneConnected: input.phoneConnected ?? null,
      receivedPendingNotifications: input.receivedPendingNotifications ?? null
    };

    if (existing) {
      await trx("wa_account_sessions")
        .where({ session_id: existing.session_id })
        .update({
          session_provider: "baileys",
          session_ref: input.sessionRef,
          connection_state: input.connectionState,
          login_mode: input.loginMode,
          last_qr_at: input.qrCode ? trx.fn.now() : trx.raw("last_qr_at"),
          heartbeat_at: trx.fn.now(),
          disconnect_reason: input.disconnectReason ?? null,
          session_meta: trx.raw("coalesce(session_meta, '{}'::jsonb) || ?::jsonb", [JSON.stringify(sessionMeta)]),
          updated_at: trx.fn.now()
        });
    } else {
      await trx("wa_account_sessions").insert({
        tenant_id: tenantId,
        wa_account_id: waAccountId,
        session_provider: "baileys",
        session_ref: input.sessionRef,
        connection_state: input.connectionState,
        login_mode: input.loginMode,
        last_qr_at: input.qrCode ? trx.fn.now() : null,
        heartbeat_at: trx.fn.now(),
        disconnect_reason: input.disconnectReason ?? null,
        session_meta: JSON.stringify(sessionMeta)
      });
    }

    await trx("wa_accounts")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .update({
        provider_key: "baileys",
        account_status: accountStatus,
        last_connected_at: input.connectionState === "open" ? trx.fn.now() : trx.raw("last_connected_at"),
        last_disconnected_at: input.connectionState === "open" ? trx.raw("last_disconnected_at") : trx.fn.now(),
        updated_at: trx.fn.now()
      });
  });

  emitWaAccountUpdated({
    tenantId,
    waAccountId,
    accountStatus,
    connectionState: input.connectionState,
    loginPhase: input.loginPhase,
    sessionRef: input.sessionRef,
    heartbeatAt: occurredAt,
    qrCode: input.qrCode ?? null,
    disconnectReason: input.disconnectReason ?? null,
    isOnline: input.isOnline ?? null,
    phoneConnected: input.phoneConnected ?? null,
    receivedPendingNotifications: input.receivedPendingNotifications ?? null,
    occurredAt
  });
}

async function touchCredsUpdate(tenantId: string, waAccountId: string) {
  await withTenantTransaction(tenantId, async (trx) => {
    await trx("wa_account_sessions")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .update({
        heartbeat_at: trx.fn.now(),
        session_meta: trx.raw(
          "coalesce(session_meta, '{}'::jsonb) || ?::jsonb",
          [JSON.stringify({ credsUpdatedAt: new Date().toISOString() })]
        ),
        updated_at: trx.fn.now()
      });
  });
}

async function buildSocket(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  loginMode: string;
}): Promise<RuntimeEntry> {
  const config = getBaileysRuntimeConfig();
  const authState = await createBaileysAuthState(input.tenantId, input.waAccountId);
  const version = await fetchLatestBaileysVersion();
  const sessionRef = `${input.instanceKey}:${crypto.randomUUID()}`;

  const socket = makeWASocket({
    version: version.version,
    auth: authState.authState,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldIgnoreJid: () => false,
    retryRequestDelayMs: 250
  });

  const entry: RuntimeEntry = {
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    instanceKey: input.instanceKey,
    socket,
    sessionRef,
    qrCode: null,
    connectionState: "connecting",
    loginPhase: "connecting",
    lastDisconnectReason: null,
    activeLoginMode: input.loginMode,
    isOnline: null,
    phoneConnected: null,
    receivedPendingNotifications: null,
    restartRequested: false,
    recentHistory: new Map()
  };

  socket.ev.on("creds.update", async (_creds: Partial<AuthenticationCreds>) => {
    await authState.saveCreds();
    await persistBaileysAuthSnapshot(input.tenantId, input.waAccountId, authState.sessionPath);
    await touchCredsUpdate(input.tenantId, input.waAccountId);
  });

  socket.ev.on("connection.update", async (update) => {
    entry.connectionState = mapConnectionState(update);
    entry.loginPhase = deriveLoginPhase(update, entry);
    entry.qrCode = typeof update.qr === "string"
      ? update.qr
      : entry.loginPhase === "qr_required"
        ? entry.qrCode
        : null;
    entry.isOnline = typeof update.isOnline === "boolean" ? update.isOnline : entry.isOnline;
    entry.phoneConnected = typeof update.legacy?.phoneConnected === "boolean"
      ? update.legacy.phoneConnected
      : entry.phoneConnected;
    entry.receivedPendingNotifications = typeof update.receivedPendingNotifications === "boolean"
      ? update.receivedPendingNotifications
      : entry.receivedPendingNotifications;
    const disconnectCode = Number(update.lastDisconnect?.error?.output?.statusCode ?? 0);
    entry.lastDisconnectReason = disconnectCode ? String(disconnectCode) : null;

    await persistSessionState(input.tenantId, input.waAccountId, {
      sessionRef: entry.sessionRef,
      connectionState: entry.connectionState,
      loginPhase: entry.loginPhase,
      loginMode: entry.activeLoginMode,
      qrCode: entry.qrCode,
      disconnectReason: entry.lastDisconnectReason,
      isOnline: entry.isOnline,
      phoneConnected: entry.phoneConnected,
      receivedPendingNotifications: entry.receivedPendingNotifications
    });

    if (update.isNewLogin) {
      entry.restartRequested = true;
      await authState.saveCreds();
      await persistBaileysAuthSnapshot(input.tenantId, input.waAccountId, authState.sessionPath);
      runtimes.delete(runtimeKey(input.tenantId, input.waAccountId));
      try {
        socket.end(new Error("pairing restart required"));
      } catch {
        // ignore
      }
      void ensureBaileysRuntime({
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        instanceKey: input.instanceKey,
        loginMode: entry.activeLoginMode,
        forceNew: true
      }).catch(() => undefined);
      return;
    }

    if (update.connection === "close") {
      const shouldReconnect =
        config.autoReconnect &&
        disconnectCode !== DisconnectReason.loggedOut &&
        !entry.restartRequested;
      if (shouldReconnect) {
        runtimes.delete(runtimeKey(input.tenantId, input.waAccountId));
        void ensureBaileysRuntime({
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          instanceKey: input.instanceKey,
          loginMode: entry.activeLoginMode,
          forceNew: true
        }).catch(() => undefined);
      }
    }
  });

  socket.ev.on("messages.upsert", (event) => {
    for (const message of event.messages) {
      const mapped = mapBaileysMessageToInbound(message);
      if (!mapped) continue;
      const bucket = entry.recentHistory.get(mapped.chatJid) ?? [];
      bucket.push(mapped);
      entry.recentHistory.set(mapped.chatJid, bucket.slice(-200));
    }
    void ingestBaileysMessagesUpsert({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      messages: event.messages,
      type: event.type
    }).catch(() => undefined);
  });

  socket.ev.on("messages.update", (updates) => {
    void ingestBaileysMessagesUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      updates
    }).catch(() => undefined);
  });

  socket.ev.on("message-receipt.update", (receipts) => {
    void ingestBaileysMessageReceipts({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      receipts
    }).catch(() => undefined);
  });

  socket.ev.on("messaging-history.set", (event) => {
    for (const message of event.messages) {
      const mapped = mapBaileysMessageToInbound(message);
      if (!mapped) continue;
      const bucket = entry.recentHistory.get(mapped.chatJid) ?? [];
      bucket.push(mapped);
      entry.recentHistory.set(mapped.chatJid, bucket.slice(-500));
    }
    void ingestBaileysHistorySet({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      messages: event.messages
    }).catch(() => undefined);
  });

  socket.ev.on("groups.update", (groups) => {
    void ingestBaileysGroupsUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      groups
    }).catch(() => undefined);
  });

  socket.ev.on("group-participants.update", (event) => {
    void ingestBaileysGroupParticipantsUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chatJid: event.id,
      participants: event.participants,
      action: event.action
    }).catch(() => undefined);
  });

  socket.ev.on("chats.update", (chats) => {
    void ingestBaileysChatsUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chats
    }).catch(() => undefined);
  });

  return entry;
}

export async function ensureBaileysRuntime(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  loginMode: string;
  forceNew?: boolean;
}) {
  const key = runtimeKey(input.tenantId, input.waAccountId);
  if (!input.forceNew) {
    const existing = runtimes.get(key);
    if (existing) {
      existing.activeLoginMode = input.loginMode;
      return existing;
    }
  }

  const runtime = await buildSocket(input);
  runtimes.set(key, runtime);
  return runtime;
}

export function getBaileysRuntime(tenantId: string, waAccountId: string) {
  return runtimes.get(runtimeKey(tenantId, waAccountId)) ?? null;
}

export function getBaileysHistorySnapshot(input: {
  tenantId: string;
  waAccountId: string;
  chatJid: string;
  limit?: number;
}) {
  const runtime = getBaileysRuntime(input.tenantId, input.waAccountId);
  if (!runtime) return [];
  const bucket = runtime.recentHistory.get(input.chatJid) ?? [];
  return bucket.slice(-(input.limit ?? 50));
}

export async function createBaileysLoginTicket(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  loginMode: string;
}): Promise<LoginTicket> {
  const runtime = await ensureBaileysRuntime(input);

  if (runtime.qrCode) {
    return {
      sessionRef: runtime.sessionRef,
      qrCode: runtime.qrCode,
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
    };
  }

  const qrCode = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for WhatsApp QR code")), 20_000);

    const maybeResolve = async () => {
      const current = runtimes.get(runtimeKey(input.tenantId, input.waAccountId));
      if (current?.qrCode) {
        clearTimeout(timeout);
        resolve(current.qrCode);
      }
    };

    void maybeResolve();
    runtime.socket.ev.on("connection.update", () => {
      void maybeResolve();
    });
  });

  return {
    sessionRef: runtime.sessionRef,
    qrCode,
    expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
  };
}

export async function restartBaileysRuntime(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  loginMode: string;
}): Promise<{ connectionState: string }> {
  const key = runtimeKey(input.tenantId, input.waAccountId);
  const existing = runtimes.get(key);
  if (existing) {
    try {
      existing.socket.end(new Error("manual restart"));
    } catch {
      // ignore
    }
    runtimes.delete(key);
  }

  const runtime = await ensureBaileysRuntime({
    ...input,
    forceNew: true
  });

  return { connectionState: runtime.connectionState };
}
