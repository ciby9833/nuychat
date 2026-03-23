import crypto from "node:crypto";

import type { ResolvedChannelConfig } from "../../channel.repository.js";
import type { UnifiedMessage } from "../../../../shared/types/unified-message.js";

type WebRawInboundMessage = {
  id?: string;
  customerRef?: string;
  displayName?: string;
  text?: string;
  attachments?: Array<{
    name?: string;
    mimeType?: string;
    size?: number;
    dataUrl?: string;
    url?: string;
  }>;
  client?: Record<string, unknown>;
  timestamp?: string;
};

export const webAdapter = {
  parseInbound(
    rawMessage: Record<string, unknown>,
    context: {
      tenantId: string;
      channelId: string;
      config: ResolvedChannelConfig;
    }
  ): UnifiedMessage {
    const message = rawMessage as WebRawInboundMessage;
    const customerRef = message.customerRef?.trim() || "guest";
    const displayName = message.displayName?.trim();
    const text = message.text?.trim() ?? "";
    const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 3) : [];
    const firstAttachment = attachments[0];
    const messageType = attachments.length > 0 ? "media" : "text";

    return {
      id: crypto.randomUUID(),
      externalId: message.id ?? crypto.randomUUID(),
      tenantId: context.tenantId,
      channelId: context.channelId,
      channelType: "web",
      direction: "inbound",
      messageType,
      senderExternalRef: customerRef,
      text,
      media: firstAttachment
        ? {
            url: firstAttachment.url || firstAttachment.dataUrl,
            mimeType: firstAttachment.mimeType,
            fileName: firstAttachment.name
          }
        : undefined,
      metadata: {
        displayName,
        rawType: "web_text",
        attachments,
        client: message.client ?? {}
      },
      receivedAt: resolveTimestamp(message.timestamp)
    };
  },
  async sendMessage(
    input: {
      text: string;
      to: string;
      media?: { url: string; mimeType: string; fileName?: string };
    },
    _context: {
      config: ResolvedChannelConfig;
    }
  ) {
    // Web channel outbound is persisted internally and fetched by customer-web polling API.
    void input;
    return {
      externalMessageId: crypto.randomUUID()
    };
  }
};

function resolveTimestamp(timestamp: string | undefined) {
  if (!timestamp) {
    return new Date();
  }

  const value = Number(timestamp);
  return Number.isNaN(value) ? new Date(timestamp) : new Date(value);
}
