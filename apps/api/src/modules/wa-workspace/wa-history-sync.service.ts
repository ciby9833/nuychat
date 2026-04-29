import type { Knex } from "knex";
import type { WAMessage } from "@whiskeysockets/baileys";

import { withTenantTransaction } from "../../infra/db/client.js";
import { waProviderAdapter } from "./provider/provider-registry.js";
import { ingestSingleBaileysMessage } from "./wa-baileys-event.service.js";
import { refreshWaConversationProjection } from "./wa-conversation-projection.service.js";

function extractStoredMessageKey(providerPayload: unknown): Record<string, unknown> | null {
  try {
    const payload = typeof providerPayload === "string"
      ? JSON.parse(providerPayload)
      : (providerPayload as Record<string, unknown> | null);
    return payload?.key && typeof payload.key === "object"
      ? (payload.key as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractStoredHistoryKey(providerPayload: unknown) {
  const key = extractStoredMessageKey(providerPayload);
  const remoteJid = typeof key?.remoteJid === "string" ? key.remoteJid : null;
  const id = typeof key?.id === "string" ? key.id : null;
  if (!remoteJid || !id) return null;
  return {
    remoteJid,
    id,
    participant: typeof key?.participant === "string" ? key.participant : null,
    fromMe: Boolean(key?.fromMe),
    remoteJidAlt: typeof key?.remoteJidAlt === "string" ? key.remoteJidAlt : null,
    participantAlt: typeof key?.participantAlt === "string" ? key.participantAlt : null,
    addressingMode: typeof key?.addressingMode === "string" ? key.addressingMode : null
  };
}

export async function triggerWaConversationHistorySync(
  trx: Knex.Transaction,
  input: {
    tenantId: string;
    waConversationId: string;
    waAccountId: string;
    instanceKey: string;
    chatJid: string;
    limit?: number;
  }
) {
  const oldestMessageRow = await trx("wa_messages")
    .where({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId
    })
    .whereNotNull("provider_message_id")
    .whereNull("deleted_for_me_at")
    .select("provider_payload", "provider_ts")
    .orderByRaw("coalesce(provider_ts, (extract(epoch from created_at) * 1000)::bigint, logical_seq) asc")
    .orderBy("logical_seq", "asc")
    .first<Record<string, unknown> | undefined>();
  const oldestMessageKey = oldestMessageRow ? extractStoredHistoryKey(oldestMessageRow.provider_payload) : null;
  const oldestMessageTimestampMs = oldestMessageRow?.provider_ts ? Number(oldestMessageRow.provider_ts) : null;

  const existingCountRow = await trx("wa_messages")
    .where({
      tenant_id: input.tenantId,
      wa_conversation_id: input.waConversationId
    })
    .whereNull("deleted_for_me_at")
    .count<{ count: string }>("wa_message_id as count")
    .first();
  const existingCount = Number(existingCountRow?.count ?? 0);

  const historyResult = await waProviderAdapter.fetchHistory({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    instanceKey: input.instanceKey,
    chatJid: input.chatJid,
    limit: input.limit ?? 100,
    oldestMessageKey,
    oldestMessageTimestampMs
  });

  if ((!oldestMessageKey || !oldestMessageTimestampMs) && historyResult.rawMessages?.length) {
    let inserted = 0;
    for (const rawMessage of historyResult.rawMessages) {
      try {
        const result = await withTenantTransaction(input.tenantId, async (messageTrx) => {
          return ingestSingleBaileysMessage(messageTrx, {
            tenantId: input.tenantId,
            waAccountId: input.waAccountId,
            message: rawMessage as unknown as WAMessage,
            eventType: "RUNTIME_HISTORY_SNAPSHOT"
          });
        });
        if (result) {
          inserted += 1;
        }
      } catch (error) {
        const remoteJid =
          typeof (rawMessage as Record<string, unknown>)?.key === "object" &&
          (rawMessage as { key?: { remoteJid?: string } }).key?.remoteJid
            ? String((rawMessage as { key?: { remoteJid?: string } }).key?.remoteJid)
            : "unknown";
        console.warn(`[triggerWaConversationHistorySync] skipping runtime history snapshot message from jid=${remoteJid}:`, error);
      }
    }
    if (inserted > 0) {
      await refreshWaConversationProjection(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        waConversationId: input.waConversationId
      });
    }
    return { inserted };
  }

  if (!oldestMessageKey || !oldestMessageTimestampMs) {
    return { inserted: 0 };
  }

  const waitUntil = Date.now() + 4_000;
  while (Date.now() < waitUntil) {
    const nextCount = await withTenantTransaction(input.tenantId, async (pollTrx) => {
      const nextCountRow = await pollTrx("wa_messages")
        .where({
          tenant_id: input.tenantId,
          wa_conversation_id: input.waConversationId
        })
        .whereNull("deleted_for_me_at")
        .count<{ count: string }>("wa_message_id as count")
        .first();
      return Number(nextCountRow?.count ?? 0);
    });
    if (nextCount > existingCount) {
      await refreshWaConversationProjection(trx, {
        tenantId: input.tenantId,
        waAccountId: input.waAccountId,
        waConversationId: input.waConversationId
      });
      return { inserted: nextCount - existingCount };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { inserted: 0 };
}
