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
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type AuthenticationCreds,
  type WAMessageKey,
  type ConnectionState
} from "@whiskeysockets/baileys";
import { withTenantTransaction } from "../../../infra/db/client.js";
import { ingestBaileysMessagesUpdate, ingestBaileysMessagesUpsert } from "../wa-baileys-event.service.js";
import {
  ingestBaileysContactsUpdate,
  ingestBaileysContactsUpsert,
  ingestBaileysChatsUpdate,
  ingestBaileysGroupParticipantsUpdate,
  ingestBaileysGroupsUpdate,
  ingestBaileysHistorySet,
  patchWaSessionSyncMeta,
  syncAllGroupsForAccount,
  syncAvatarsForAccount
} from "../wa-baileys-sync.service.js";
import { ingestBaileysMessageReceipts } from "../wa-baileys-receipt.service.js";
import { emitWaAccountUpdated } from "../wa-realtime.service.js";
import { deriveWaAccountStatus, deriveWaStatus } from "../wa-session-status.js";
import { createBaileysAuthState, persistBaileysAuthSnapshot, resetBaileysAuthState } from "./baileys-auth.repository.js";
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
  syncFinalizeTimer: NodeJS.Timeout | null;
  recentHistory: Map<string, ReturnType<typeof mapBaileysMessageToInbound>[]>;
};

type LoginTicket = {
  sessionRef: string;
  qrCode: string | null;
  loginPhase: string;
  connectionState: string;
  expiresAt: string;
};

const runtimes = new Map<string, RuntimeEntry>();

const baileysLogger = {
  level: "info",
  trace(obj: unknown, msg?: string) {
    if (process.env.NODE_ENV !== "production") console.debug("[baileys]", msg ?? "", obj);
  },
  debug(obj: unknown, msg?: string) {
    if (process.env.NODE_ENV !== "production") console.debug("[baileys]", msg ?? "", obj);
  },
  info(obj: unknown, msg?: string) {
    console.info("[baileys]", msg ?? "", obj);
  },
  warn(obj: unknown, msg?: string) {
    console.warn("[baileys]", msg ?? "", obj);
  },
  error(obj: unknown, msg?: string) {
    console.error("[baileys]", msg ?? "", obj);
  },
  fatal(obj: unknown, msg?: string) {
    console.error("[baileys:fatal]", msg ?? "", obj);
  },
  child() {
    return baileysLogger;
  }
};

function runtimeKey(tenantId: string, waAccountId: string) {
  return `${tenantId}:${waAccountId}`;
}

function mapConnectionState(
  update: Partial<ConnectionState>,
  previous: Pick<RuntimeEntry, "connectionState">
): string {
  if (update.qr) return "qr_required";
  if (update.connection === "open") return "open";
  if (previous.connectionState === "open" && update.connection === "connecting") return "open";
  if (update.connection === "connecting") return "connecting";
  if (update.connection === "close") return "close";
  return previous.connectionState || "idle";
}

function deriveLoginPhase(
  update: Partial<ConnectionState>,
  current: {
    qrCode: string | null;
    loginPhase: string;
    receivedPendingNotifications: boolean | null;
    connectionState: string;
  }
): string {
  if (typeof update.qr === "string" && update.qr.length > 0) return "qr_required";
  if (update.receivedPendingNotifications === true) return "connected";
  if (update.isNewLogin) return "syncing";
  if (update.connection === "close") return "failed";
  if (update.connection === "open") {
    if (update.receivedPendingNotifications === true) return "connected";
    return "syncing";
  }
  if (current.connectionState === "open" && update.connection === "connecting") {
    return current.receivedPendingNotifications === true ? "connected" : "syncing";
  }
  if (update.connection === "connecting" || current.connectionState === "connecting") {
    if (current.qrCode || current.loginPhase === "qr_required") return "qr_scanned";
    return "connecting";
  }
  if (current.receivedPendingNotifications === true) return "connected";
  return current.loginPhase || "idle";
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
  const sessionSnapshot = {
    connectionState: input.connectionState,
    loginPhase: input.loginPhase,
    disconnectReason: input.disconnectReason ?? null,
    qrCodeAvailable: Boolean(input.qrCode),
    historySyncedAt: null,
    chatsSyncedAt: null,
    groupsSyncedAt: null,
    hasGroupChats: null
  } as const;
  const accountStatus = deriveWaAccountStatus({
    storedAccountStatus: null,
    session: sessionSnapshot
  });

  await withTenantTransaction(tenantId, async (trx) => {
    const existing = await trx("wa_account_sessions")
      .where({ tenant_id: tenantId, wa_account_id: waAccountId })
      .orderByRaw("coalesce(updated_at, heartbeat_at, created_at) desc, created_at desc")
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
        last_disconnected_at: input.connectionState === "close" ? trx.fn.now() : trx.raw("last_disconnected_at"),
        updated_at: trx.fn.now()
      });
  });

  emitWaAccountUpdated({
    tenantId,
    waAccountId,
    status: deriveWaStatus({ accountStatus, session: sessionSnapshot }),
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

async function loadStoredBaileysMessageContent(input: {
  tenantId: string;
  waAccountId: string;
  key: WAMessageKey;
}) {
  const providerMessageId = typeof input.key.id === "string" ? input.key.id : null;
  if (!providerMessageId) return undefined;

  return withTenantTransaction(input.tenantId, async (trx) => {
    const row = await trx("wa_messages")
      .where({
        tenant_id: input.tenantId,
        wa_account_id: input.waAccountId,
        provider_message_id: providerMessageId
      })
      .select("provider_payload")
      .first<Record<string, unknown> | undefined>();
    if (!row?.provider_payload) return undefined;
    const payload = typeof row.provider_payload === "string"
      ? JSON.parse(String(row.provider_payload))
      : (row.provider_payload as Record<string, unknown>);
    if (payload && typeof payload === "object" && payload.message && typeof payload.message === "object") {
      return payload.message as Record<string, unknown>;
    }
    return undefined;
  });
}

function scheduleSyncFinalization(entry: RuntimeEntry) {
  if (entry.syncFinalizeTimer) return;
  entry.syncFinalizeTimer = setTimeout(() => {
    entry.syncFinalizeTimer = null;
    void patchWaSessionSyncMeta({
      tenantId: entry.tenantId,
      waAccountId: entry.waAccountId,
      patch: {
        historySyncedAt: new Date().toISOString(),
        chatsSyncedAt: new Date().toISOString(),
        groupsSyncedAt: new Date().toISOString(),
        hasGroupChats: entry.recentHistory.size > 0
          ? Array.from(entry.recentHistory.keys()).some((jid) => jid.endsWith("@g.us"))
          : null
      }
    }).catch((error) => {
      console.error("[wa-sync-finalize] failed", {
        tenantId: entry.tenantId,
        waAccountId: entry.waAccountId,
        error
      });
    });
  }, 10_000);
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
    logger: baileysLogger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: true,
    shouldIgnoreJid: () => false,
    retryRequestDelayMs: 250,
    getMessage: async (key) => loadStoredBaileysMessageContent({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      key
    }),
    // Feed Baileys our stored group metadata so it doesn't need to re-fetch from WhatsApp
    // every time it processes a group message (e.g., for group notifications, mentions, etc.)
    cachedGroupMetadata: async (jid: string) => {
      try {
        return await withTenantTransaction(input.tenantId, async (trx) => {
          const conv = await trx("wa_conversations")
            .where({ tenant_id: input.tenantId, wa_account_id: input.waAccountId, chat_jid: jid })
            .select("wa_conversation_id", "subject")
            .first<Record<string, unknown> | undefined>();
          if (!conv) return undefined;
          const members = await trx("wa_conversation_members")
            .where({ tenant_id: input.tenantId, wa_conversation_id: conv.wa_conversation_id })
            .whereNull("left_at")
            .select("participant_jid", "is_admin");
          return {
            id: jid,
            subject: conv.subject ? String(conv.subject) : jid,
            participants: members.map((m) => ({
              id: String(m.participant_jid),
              admin: m.is_admin ? ("admin" as const) : null
            }))
          };
        });
      } catch {
        return undefined;
      }
    }
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
    syncFinalizeTimer: null,
    recentHistory: new Map()
  };

  socket.ev.on("creds.update", async (_creds: Partial<AuthenticationCreds>) => {
    try {
      await authState.saveCreds();
      await persistBaileysAuthSnapshot(input.tenantId, input.waAccountId, authState.sessionPath);
      await touchCredsUpdate(input.tenantId, input.waAccountId);
    } catch (error) {
      console.error("[wa-baileys] creds.update persistence failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    }
  });

  socket.ev.on("connection.update", async (update) => {
    const nextConnectionState = mapConnectionState(update, entry);
    const nextQrCode = typeof update.qr === "string"
      ? update.qr
      : nextConnectionState === "qr_required"
        ? entry.qrCode
        : null;
    const nextIsOnline = typeof update.isOnline === "boolean" ? update.isOnline : entry.isOnline;
    const nextPhoneConnected = typeof update.legacy?.phoneConnected === "boolean"
      ? update.legacy.phoneConnected
      : entry.phoneConnected;
    const nextReceivedPendingNotifications = typeof update.receivedPendingNotifications === "boolean"
      ? update.receivedPendingNotifications
      : entry.receivedPendingNotifications;
    const nextLoginPhase = deriveLoginPhase(update, {
      qrCode: nextQrCode,
      loginPhase: entry.loginPhase,
      receivedPendingNotifications: nextReceivedPendingNotifications,
      connectionState: nextConnectionState
    });

    entry.connectionState = nextConnectionState;
    entry.loginPhase = nextLoginPhase;
    entry.qrCode = nextQrCode;
    entry.isOnline = nextIsOnline;
    entry.phoneConnected = nextPhoneConnected;
    entry.receivedPendingNotifications = nextReceivedPendingNotifications;
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

    if (entry.connectionState === "open" && (entry.loginPhase === "connected" || entry.loginPhase === "syncing")) {
      scheduleSyncFinalization(entry);
    }

    // When the account is fully connected and initial sync is done, proactively refresh
    // all group metadata (names + members) and then fetch avatars in the background.
    // We delay by 8s to let Baileys finish its own messaging-history.set / groups.update
    // event flood first, so our proactive fetches fill in gaps rather than race with them.
    if (update.receivedPendingNotifications === true) {
      setTimeout(() => {
        void syncAllGroupsForAccount(socket, input.tenantId, input.waAccountId).catch((error) => {
          console.error("[wa-sync] proactive group sync failed", { tenantId: input.tenantId, waAccountId: input.waAccountId, error });
        });
      }, 8_000);

      // Avatar sync runs after group sync finishes (offset by 60s to avoid racing)
      setTimeout(() => {
        void syncAvatarsForAccount(socket, input.tenantId, input.waAccountId).catch((error) => {
          console.error("[wa-sync] avatar sync failed", { tenantId: input.tenantId, waAccountId: input.waAccountId, error });
        });
      }, 60_000);
    }

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
    }).catch((error) => {
      console.error("[wa-baileys] messages.upsert ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("messages.update", (updates) => {
    void ingestBaileysMessagesUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      updates
    }).catch((error) => {
      console.error("[wa-baileys] messages.update ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("message-receipt.update", (receipts) => {
    void ingestBaileysMessageReceipts({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      receipts
    }).catch((error) => {
      console.error("[wa-baileys] message-receipt.update ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
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
    }).catch((error) => {
      console.error("[wa-baileys] messaging-history.set ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("groups.update", (groups) => {
    void (async () => {
      const hydratedGroups = await Promise.all(groups.map(async (group) => {
        if (!group.id?.endsWith("@g.us")) return group;
        try {
          return await socket.groupMetadata(group.id);
        } catch {
          return group;
        }
      }));
      await ingestBaileysGroupsUpdate({
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        groups: hydratedGroups
      });
    })().catch((error) => {
      console.error("[wa-baileys] groups.update ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("group-participants.update", (event) => {
    void (async () => {
      try {
        const metadata = await socket.groupMetadata(event.id);
        await ingestBaileysGroupsUpdate({
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          groups: [metadata]
        });
        return;
      } catch {
        await ingestBaileysGroupParticipantsUpdate({
          tenantId: input.tenantId,
          waAccountId: input.waAccountId,
          chatJid: event.id,
          participants: event.participants,
          action: event.action
        });
      }
    })().catch((error) => {
      console.error("[wa-baileys] group-participants.update ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("chats.update", (chats) => {
    void ingestBaileysChatsUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chats
    }).catch((error) => {
      console.error("[wa-baileys] chats.update ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("chats.upsert", (chats) => {
    void ingestBaileysChatsUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      chats
    }).catch((error) => {
      console.error("[wa-baileys] chats.upsert ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("contacts.upsert", (contacts) => {
    void ingestBaileysContactsUpsert({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      contacts
    }).catch((error) => {
      console.error("[wa-baileys] contacts.upsert ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  socket.ev.on("contacts.update", (contacts) => {
    void ingestBaileysContactsUpdate({
      tenantId: input.tenantId,
      waAccountId: input.waAccountId,
      contacts
    }).catch((error) => {
      console.error("[wa-baileys] contacts.update ingest failed", {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        error
      });
    });
  });

  return entry;
}

export async function ensureBaileysRuntime(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  loginMode: string;
  forceNew?: boolean;
  resetAuth?: boolean;
}) {
  const key = runtimeKey(input.tenantId, input.waAccountId);
  if (input.resetAuth) {
    const existing = runtimes.get(key);
    if (existing) {
      try {
        existing.socket.end(new Error("reset auth state"));
      } catch {
        // ignore
      }
      runtimes.delete(key);
    }
    await resetBaileysAuthState(input.tenantId, input.waAccountId);
  }
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
  forceFresh?: boolean;
}): Promise<LoginTicket> {
  const runtime = await ensureBaileysRuntime({
    ...input,
    forceNew: input.forceFresh ?? false,
    resetAuth: input.forceFresh ?? false
  });

  if (runtime.qrCode) {
    return {
      sessionRef: runtime.sessionRef,
      qrCode: runtime.qrCode,
      loginPhase: runtime.loginPhase,
      connectionState: runtime.connectionState,
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
    };
  }

  if (runtime.loginPhase && runtime.loginPhase !== "idle") {
    return {
      sessionRef: runtime.sessionRef,
      qrCode: runtime.qrCode,
      loginPhase: runtime.loginPhase,
      connectionState: runtime.connectionState,
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
    };
  }

  const ticket = await new Promise<LoginTicket>((resolve) => {
    const timeout = setTimeout(() => {
      const current = runtimes.get(runtimeKey(input.tenantId, input.waAccountId));
      resolve({
        sessionRef: current?.sessionRef ?? runtime.sessionRef,
        qrCode: current?.qrCode ?? null,
        loginPhase: current?.loginPhase ?? runtime.loginPhase,
        connectionState: current?.connectionState ?? runtime.connectionState,
        expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
      });
    }, 20_000);

    const maybeResolve = () => {
      const current = runtimes.get(runtimeKey(input.tenantId, input.waAccountId));
      if (current && (current.qrCode || current.loginPhase !== "idle")) {
        clearTimeout(timeout);
        resolve({
          sessionRef: current.sessionRef,
          qrCode: current.qrCode,
          loginPhase: current.loginPhase,
          connectionState: current.connectionState,
          expiresAt: new Date(Date.now() + 60 * 1000).toISOString()
        });
      }
    };

    maybeResolve();
    runtime.socket.ev.on("connection.update", () => {
      maybeResolve();
    });
  });

  return ticket;
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
    if (existing.syncFinalizeTimer) {
      clearTimeout(existing.syncFinalizeTimer);
    }
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

export async function logoutBaileysRuntime(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
}): Promise<{ ok: true }> {
  const key = runtimeKey(input.tenantId, input.waAccountId);
  const existing = runtimes.get(key);
  if (existing) {
    if (existing.syncFinalizeTimer) {
      clearTimeout(existing.syncFinalizeTimer);
    }
    try {
      await existing.socket.logout();
    } catch {
      try {
        existing.socket.end(new Error("manual logout"));
      } catch {
        // ignore
      }
    }
    runtimes.delete(key);
  }

  await resetBaileysAuthState(input.tenantId, input.waAccountId);

  await persistSessionState(input.tenantId, input.waAccountId, {
    sessionRef: `${input.instanceKey}:logged-out`,
    connectionState: "close",
    loginPhase: "idle",
    loginMode: "admin_logout",
    qrCode: null,
    disconnectReason: "manual_logout",
    isOnline: false,
    phoneConnected: false,
    receivedPendingNotifications: false
  });

  return { ok: true };
}

export async function markBaileysConversationRead(input: {
  tenantId: string;
  waAccountId: string;
  instanceKey: string;
  keys: Array<{
    remoteJid: string;
    id: string;
    participant?: string | null;
    fromMe?: boolean;
  }>;
}): Promise<{ ok: true }> {
  const keys = input.keys
    .filter((item) => item.remoteJid && item.id)
    .map((item) => ({
      remoteJid: item.remoteJid,
      id: item.id,
      participant: item.participant ?? undefined,
      fromMe: item.fromMe ?? false
    }));
  if (keys.length === 0) {
    return { ok: true };
  }

  const runtime = await ensureBaileysRuntime({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    instanceKey: input.instanceKey,
    loginMode: "mark_read"
  });
  await runtime.socket.readMessages(keys);
  return { ok: true };
}
