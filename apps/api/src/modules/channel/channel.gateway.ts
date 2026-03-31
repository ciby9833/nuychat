import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

import { inboundQueue } from "../../infra/queue/queues.js";
import {
  findActiveChannelConfig,
  findActiveWhatsAppChannelByPhoneNumberId
} from "./channel.repository.js";
import { assertWhatsAppWebhookConfigured } from "./whatsapp-platform-config.js";
import { withTenantTransaction } from "../../infra/db/client.js";
import { updateMessageStatusByExternalId } from "../message/message.repository.js";
import { realtimeEventBus } from "../realtime/realtime.events.js";
import { emitConversationUpdatedSnapshot } from "../conversation/conversation-realtime.service.js";

export async function channelGateway(app: FastifyInstance) {
  app.get("/webhook/whatsapp", async (req, reply) => {
    const platformConfig = assertWhatsAppWebhookConfigured();
    const query = req.query as {
      "hub.mode"?: string;
      "hub.verify_token"?: string;
      "hub.challenge"?: string;
    };
    if (query["hub.mode"] !== "subscribe" || !query["hub.verify_token"]) {
      return reply.status(403).send("Forbidden");
    }

    if (query["hub.verify_token"] !== platformConfig.webhookVerifyToken) {
      return reply.status(403).send("Forbidden");
    }

    return reply.send(query["hub.challenge"] ?? "");
  });

  app.post(
    "/webhook/whatsapp",
    {
      config: { rawBody: true }
    },
    async (req, reply) => {
      const platformConfig = assertWhatsAppWebhookConfigured();
      const payload = req.body as Record<string, unknown>;
      const rawBody = (req as { rawBody?: Buffer }).rawBody;
      const phoneNumberId = extractWhatsAppPhoneNumberId(payload);
      if (!phoneNumberId) {
        return reply.status(400).send("Missing phone_number_id");
      }

      const channelConfig = await findActiveWhatsAppChannelByPhoneNumberId(phoneNumberId);
      if (!channelConfig) {
        return reply.status(404).send("Unknown WhatsApp channel");
      }

      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      if (!verifyMetaSignature(rawBody, signature, platformConfig.appSecret ?? undefined)) {
        return reply.status(401).send("Invalid signature");
      }

      const messages = extractWhatsAppMessages(payload);
      for (const msg of messages) {
        const messageId = typeof msg.id === "string" ? msg.id : crypto.randomUUID();
        await enqueueInbound({
          channelConfig,
          messageId,
          rawMessage: msg,
          jobPrefix: "wa"
        });
      }

      const statuses = extractWhatsAppStatuses(payload);
      for (const status of statuses) {
        await applyWhatsAppStatus(channelConfig.tenantId, status);
      }

      return reply.send("EVENT_RECEIVED");
    }
  );

  app.get("/webhook/:channelId", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const query = req.query as {
      "hub.mode"?: string;
      "hub.verify_token"?: string;
      "hub.challenge"?: string;
    };

    const channelConfig = await findActiveChannelConfig(channelId);
    if (!channelConfig) {
      return reply.status(404).send("Unknown channel");
    }

    if (query["hub.mode"] !== "subscribe") {
      return reply.status(403).send("Forbidden");
    }

    if (!channelConfig.verifyToken || query["hub.verify_token"] !== channelConfig.verifyToken) {
      return reply.status(403).send("Forbidden");
    }

    return reply.send(query["hub.challenge"] ?? "");
  });

  app.post(
    "/webhook/:channelId",
    {
      config: { rawBody: true }
    },
    async (req, reply) => {
      const { channelId } = req.params as { channelId: string };
      const rawBody = (req as { rawBody?: Buffer }).rawBody;
      const payload = req.body as Record<string, unknown>;

      const channelConfig = await findActiveChannelConfig(channelId);
      if (!channelConfig) {
        req.log.warn({ channelId }, "Active channel config not found");
        return reply.status(404).send("Unknown channel");
      }

      if (channelConfig.channelType === "webhook") {
        const secret = readString(channelConfig.rawConfig, ["webhookSecret"]);
        if (!verifyWebhookSignature(rawBody, req.headers["x-nuychat-signature"] as string | undefined, secret)) {
          return reply.status(401).send("Invalid signature");
        }

        const messageId = typeof payload.id === "string" ? payload.id : crypto.randomUUID();
        await enqueueInbound({
          channelConfig,
          messageId,
          rawMessage: payload,
          jobPrefix: "wh"
        });
        return reply.send({ ok: true, messageId });
      }

      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const platformConfig = assertWhatsAppWebhookConfigured();
      if (!verifyMetaSignature(rawBody, signature, platformConfig.appSecret ?? undefined)) {
        return reply.status(401).send("Invalid signature");
      }

      const expectedPhoneNumberId = readString(channelConfig.rawConfig, ["phoneNumberId"]);
      const incomingPhoneNumberId = extractWhatsAppPhoneNumberId(payload);
      if (expectedPhoneNumberId && incomingPhoneNumberId && normalizeDigits(expectedPhoneNumberId) !== normalizeDigits(incomingPhoneNumberId)) {
        return reply.status(403).send("Channel mismatch");
      }

      const messages = extractWhatsAppMessages(payload);
      for (const msg of messages) {
        const messageId = typeof msg.id === "string" ? msg.id : crypto.randomUUID();
        await enqueueInbound({
          channelConfig,
          messageId,
          rawMessage: msg,
          jobPrefix: "wa"
        });
      }

      const statuses = extractWhatsAppStatuses(payload);
      for (const status of statuses) {
        await applyWhatsAppStatus(channelConfig.tenantId, status);
      }

      return reply.send("EVENT_RECEIVED");
    }
  );
}

async function enqueueInbound(input: {
  channelConfig: { tenantId: string; channelId: string; channelType: string };
  messageId: string;
  rawMessage: Record<string, unknown>;
  jobPrefix: string;
}) {
  await inboundQueue.add(
    "process-inbound",
    {
      tenantId: input.channelConfig.tenantId,
      channelId: input.channelConfig.channelId,
      channelType: input.channelConfig.channelType,
      externalId: input.messageId,
      rawMessage: input.rawMessage
    },
    {
      jobId: `${input.jobPrefix}:${input.channelConfig.channelId}:${input.messageId}`,
      removeOnComplete: 100,
      removeOnFail: 50
    }
  );
}

function verifyMetaSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  appSecret: string | undefined
) {
  if (!rawBody || !signature?.startsWith("sha256=") || !appSecret) {
    return false;
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.slice(7), "hex"));
  } catch {
    return false;
  }
}

function verifyWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined, secret: string | undefined) {
  if (!secret) {
    return true;
  }

  if (!rawBody || !signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.slice(7), "hex"));
  } catch {
    return false;
  }
}

type InboundMessage = {
  id?: string;
  [key: string]: unknown;
};

type WhatsAppInboundValue = {
  metadata?: {
    phone_number_id?: string;
    display_phone_number?: string;
  };
  contacts?: Array<{
    wa_id?: string;
    profile?: { name?: string };
  }>;
  messages?: InboundMessage[];
  statuses?: WhatsAppStatus[];
};

type WhatsAppStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number | string; title?: string }>;
};

function extractWhatsAppMessages(payload: Record<string, unknown>): InboundMessage[] {
  const value = extractWhatsAppValue(payload);
  if (!value?.messages?.length) return [];

  return value.messages.map((message) => {
    const from = typeof message.from === "string" ? message.from : undefined;
    const contact = value.contacts?.find((item) => item.wa_id === from);
    return {
      ...message,
      __nuychat_contact: contact,
      __nuychat_metadata: value.metadata
    };
  });
}

function extractWhatsAppStatuses(payload: Record<string, unknown>): WhatsAppStatus[] {
  return extractWhatsAppValue(payload)?.statuses ?? [];
}

function extractWhatsAppPhoneNumberId(payload: Record<string, unknown>) {
  const metadata = extractWhatsAppValue(payload)?.metadata;
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const phoneNumberId = (metadata as { phone_number_id?: unknown }).phone_number_id;
  return typeof phoneNumberId === "string" && phoneNumberId.length > 0 ? phoneNumberId : undefined;
}

function extractWhatsAppValue(payload: Record<string, unknown>): WhatsAppInboundValue | null {
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : undefined;
  const changes =
    entry && typeof entry === "object" && Array.isArray((entry as { changes?: unknown[] }).changes)
      ? (entry as { changes: unknown[] }).changes[0]
      : undefined;
  const value = changes && typeof changes === "object" ? (changes as { value?: unknown }).value : undefined;
  return value && typeof value === "object" ? (value as WhatsAppInboundValue) : null;
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function normalizeDigits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

async function applyWhatsAppStatus(tenantId: string, status: WhatsAppStatus) {
  const externalId = typeof status.id === "string" ? status.id : "";
  const normalizedStatus = normalizeWhatsAppStatus(status.status);
  if (!externalId || !normalizedStatus) return;

  const occurredAt = resolveStatusTimestamp(status.timestamp);
  const error = Array.isArray(status.errors) ? status.errors[0] : undefined;

  const updated = await withTenantTransaction(tenantId, async (trx) => {
    return updateMessageStatusByExternalId(
      tenantId,
      externalId,
      {
        status: normalizedStatus,
        occurredAt,
        errorCode: error?.code != null ? String(error.code) : null,
        errorTitle: typeof error?.title === "string" ? error.title : null
      },
      trx
    );
  });

  if (!updated) return;

  realtimeEventBus.emitEvent("message.updated", {
    tenantId,
    conversationId: updated.conversationId,
    messageId: updated.messageId,
    messageStatus: updated.messageStatus,
    occurredAt: occurredAt.toISOString()
  });

  await withTenantTransaction(tenantId, async (trx) => {
    await emitConversationUpdatedSnapshot(trx, tenantId, updated.conversationId, {
      occurredAt: occurredAt.toISOString()
    });
  }).catch(() => null);
}

function normalizeWhatsAppStatus(status: string | undefined) {
  if (status === "sent" || status === "delivered" || status === "read" || status === "failed" || status === "deleted") {
    return status;
  }
  return null;
}

function resolveStatusTimestamp(timestamp: string | undefined) {
  if (!timestamp) return new Date();
  const numeric = Number(timestamp);
  return Number.isNaN(numeric) ? new Date(timestamp) : new Date(numeric * 1000);
}
