import crypto from "node:crypto";

import type { ResolvedChannelConfig } from "../../channel.repository.js";
import { normalizeStructuredActions, normalizeStructuredMessage, structuredToPlainText } from "../../../../shared/messaging/structured-message.js";
import type { UnifiedMessage } from "../../../../shared/types/unified-message.js";

/**
 * Webhook channel adapter.
 *
 * Inbound: accepts a JSON POST from any external system with
 *   { customerRef, text, timestamp?, displayName? }
 *
 * Outbound: POSTs the reply to the URL stored in
 *   channel_configs.raw_config.outboundWebhookUrl
 *   Adds an HMAC-SHA256 signature header if raw_config.webhookSecret is set:
 *     X-NuyChat-Signature: sha256=<hex>
 */

type WebhookRawInboundMessage = {
  id?: string;
  customerRef?: string;
  displayName?: string;
  text?: string;
  timestamp?: string;
  attachments?: Array<{
    url?: string;
    mimeType?: string;
    name?: string;
    size?: number;
  }>;
};

export const webhookAdapter = {
  parseInbound(
    rawMessage: Record<string, unknown>,
    context: {
      tenantId: string;
      channelId: string;
      config: ResolvedChannelConfig;
    }
  ): UnifiedMessage {
    const msg = rawMessage as WebhookRawInboundMessage;
    const customerRef = (msg.customerRef ?? "webhook-customer").trim();
    const text = (msg.text ?? "").trim();
    const attachments = Array.isArray(msg.attachments) ? msg.attachments.slice(0, 5) : [];
    const messageType = attachments.length > 0 ? "media" : "text";

    return {
      id: crypto.randomUUID(),
      externalId: msg.id ?? crypto.randomUUID(),
      tenantId: context.tenantId,
      channelId: context.channelId,
      channelType: "webhook",
      chatType: "direct",
      chatExternalRef: customerRef,
      chatName: msg.displayName,
      direction: "inbound",
      messageType,
      senderExternalRef: customerRef,
      participantExternalRef: customerRef,
      participantDisplayName: msg.displayName,
      text,
      attachments: attachments.length > 0
        ? attachments.map((a) => ({
            url: a.url,
            mimeType: a.mimeType,
            fileName: a.name
          }))
        : undefined,
      metadata: {
        displayName: msg.displayName,
        rawType: "webhook_text"
      },
      receivedAt: msg.timestamp ? new Date(msg.timestamp) : new Date()
    };
  },

  async sendMessage(
    input: {
      text: string;
      structured?: unknown;
      actions?: unknown;
      to: string;
      recipientType?: "individual" | "group";
      attachment?: { url: string; mimeType: string; fileName?: string };
      contextMessageId?: string;
      reactionEmoji?: string;
      reactionMessageId?: string;
    },
    context: { config: ResolvedChannelConfig }
  ) {
    const outboundWebhookUrl = readString(context.config.rawConfig, ["outboundWebhookUrl"]);
    if (!outboundWebhookUrl) {
      // No webhook URL configured — silently succeed (dev / test mode)
      return { externalMessageId: crypto.randomUUID() };
    }

    const structured = normalizeStructuredMessage(input.structured);
    const actions = normalizeStructuredActions(input.actions);
    const resolvedText = structuredToPlainText(structured, input.text);

    const body = JSON.stringify({
      event: "message.outbound",
      to: input.to,
      recipientType: input.recipientType ?? "individual",
      text: resolvedText,
      structured: structured ?? undefined,
      actions: actions.length > 0 ? actions : undefined,
      attachment: input.attachment ?? undefined,
      contextMessageId: input.contextMessageId ?? undefined,
      reactionEmoji: input.reactionEmoji ?? undefined,
      reactionMessageId: input.reactionMessageId ?? undefined,
      timestamp: new Date().toISOString()
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    // HMAC-SHA256 signature for payload verification by the receiving system
    const secret = readString(context.config.rawConfig, ["webhookSecret"]);
    if (secret) {
      const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
      headers["X-NuyChat-Signature"] = `sha256=${sig}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(outboundWebhookUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Webhook delivery failed: ${res.status} ${text.slice(0, 200)}`);
      }

      // Try to parse a message ID from the response; fall back to a random UUID
      const json = await res.json().catch(() => ({})) as Record<string, unknown>;
      const externalMessageId =
        (typeof json.messageId === "string" ? json.messageId : null) ??
        (typeof json.id === "string" ? json.id : null) ??
        crypto.randomUUID();

      return { externalMessageId };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
};

function readString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = source[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}
