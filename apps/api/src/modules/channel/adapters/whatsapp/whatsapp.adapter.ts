import crypto from "node:crypto";

import type { ResolvedChannelConfig } from "../../channel.repository.js";
import { readRequiredBaseUrlEnv } from "../../../../infra/env.js";
import { normalizeStructuredActions, normalizeStructuredMessage, structuredToPlainText } from "../../../../shared/messaging/structured-message.js";
import type { StructuredMessageAction } from "../../../../shared/types/structured-message.js";
import type { UnifiedMessage } from "../../../../shared/types/unified-message.js";
import { assertWhatsAppMessagingConfigured } from "../../whatsapp-platform-config.js";

type WhatsAppRawMessage = {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  recipient_type?: string;
  group_id?: string;
  group_name?: string;
  group_subject?: string;
  context?: {
    id?: string;
    forwarded?: boolean;
    frequently_forwarded?: boolean;
  };
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string }> }>;
  reaction?: { emoji?: string; message_id?: string };
  interactive?: {
    type?: "button_reply" | "list_reply";
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  __nuychat_contact?: {
    wa_id?: string;
    profile?: { name?: string };
  };
  __nuychat_metadata?: {
    phone_number_id?: string;
    display_phone_number?: string;
  };
};

export const whatsappAdapter = {
  parseInbound(
    rawMessage: Record<string, unknown>,
    context: {
      tenantId: string;
      channelId: string;
      config: ResolvedChannelConfig;
    }
  ): UnifiedMessage {
    const message = rawMessage as WhatsAppRawMessage;
    const groupId = readString(message as unknown as Record<string, unknown>, ["group_id", "groupId", "chat_id", "chatId"]);
    const groupName = readString(message as unknown as Record<string, unknown>, ["group_name", "groupName", "group_subject", "groupSubject", "subject"]);
    const isGroupMessage = Boolean(groupId);
    const participantDisplayName = message.__nuychat_contact?.profile?.name;
    const chatExternalRef = isGroupMessage ? groupId! : (message.from ?? "unknown");
    const base = {
      id: crypto.randomUUID(),
      externalId: message.id ?? crypto.randomUUID(),
      tenantId: context.tenantId,
      channelId: context.channelId,
      channelType: "whatsapp",
      chatType: isGroupMessage ? "group" as const : "direct" as const,
      chatExternalRef,
      chatName: isGroupMessage ? groupName ?? undefined : participantDisplayName ?? undefined,
      direction: "inbound" as const,
      senderExternalRef: message.from ?? "unknown",
      participantExternalRef: message.from ?? "unknown",
      participantDisplayName: participantDisplayName ?? undefined,
      recipientExternalRef: readString(context.config.rawConfig, ["phoneNumberId"]),
      receivedAt: resolveTimestamp(message.timestamp),
      metadata: {
        rawType: message.type ?? "unknown",
        recipientType: message.recipient_type ?? (isGroupMessage ? "group" : "individual"),
        groupId: groupId ?? undefined,
        groupName: groupName ?? undefined,
        displayPhoneNumber: message.__nuychat_metadata?.display_phone_number,
        phoneNumberId: message.__nuychat_metadata?.phone_number_id
      },
      context: {
        externalMessageId: message.context?.id,
        forwarded: Boolean(message.context?.forwarded),
        frequentlyForwarded: Boolean(message.context?.frequently_forwarded)
      }
    };

    switch (message.type) {
      case "text":
        return {
          ...base,
          messageType: "text",
          text: message.text?.body ?? ""
        };
      case "image":
      case "audio":
      case "video":
      case "document":
      case "sticker":
        return {
          ...base,
          messageType: "media",
          text:
            message.image?.caption ??
            message.video?.caption ??
            message.document?.caption ??
            "",
          attachments: buildMediaPayload(message)
        };
      case "interactive":
        return {
          ...base,
          messageType: "interactive",
          actions: buildActions(message)
        };
      case "location":
        return {
          ...base,
          messageType: "location",
          location: {
            latitude: message.location?.latitude ?? 0,
            longitude: message.location?.longitude ?? 0,
            name: message.location?.name,
            address: message.location?.address
          }
        };
      case "contacts":
        return {
          ...base,
          messageType: "contacts",
          contacts:
            message.contacts?.map((contact) => ({
              name: contact.name?.formatted_name,
              phones: contact.phones?.map((phone) => phone.phone).filter(Boolean) as string[]
            })) ?? []
        };
      case "reaction":
        return {
          ...base,
          messageType: "reaction",
          text: message.reaction?.emoji,
          reaction: {
            emoji: message.reaction?.emoji,
            targetExternalMessageId: message.reaction?.message_id
          },
          metadata: {
            ...base.metadata,
            targetMessageId: message.reaction?.message_id
          }
        };
      default:
        return {
          ...base,
          messageType: "system_event",
          metadata: {
            ...base.metadata,
            rawMessage
          }
        };
    }
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
    context: {
      config: ResolvedChannelConfig;
    }
  ) {
    const phoneNumberId = readString(context.config.rawConfig, ["phoneNumberId"]);
    const platformConfig = assertWhatsAppMessagingConfigured();
    const accessToken = platformConfig.systemUserAccessToken;

    if (!phoneNumberId || !accessToken) {
      throw new Error("Missing WhatsApp phoneNumberId or META_SYSTEM_USER_ACCESS_TOKEN");
    }

    const structured = normalizeStructuredMessage(input.structured);
    const actions = normalizeStructuredActions(input.actions);
    const resolvedText = structuredToPlainText(structured, input.text);

    let requestBody: Record<string, unknown>;

    if (input.reactionEmoji && input.reactionMessageId) {
      requestBody = {
        messaging_product: "whatsapp",
        recipient_type: input.recipientType ?? "individual",
        to: input.to,
        type: "reaction",
        reaction: {
          message_id: input.reactionMessageId,
          emoji: input.reactionEmoji
        }
      };
    } else if (input.attachment) {
      const mediaType = resolveWhatsAppMediaType(input.attachment.mimeType, input.attachment.fileName);
      // Ensure absolute URL for WhatsApp Cloud API (it needs a publicly accessible URL)
      const mediaUrl = input.attachment.url.startsWith("http")
        ? input.attachment.url
        : `${readRequiredBaseUrlEnv("API_PUBLIC_BASE")}${input.attachment.url}`;

      if (mediaType === "sticker") {
        requestBody = {
          messaging_product: "whatsapp", recipient_type: input.recipientType ?? "individual", to: input.to, type: "sticker",
          sticker: { link: mediaUrl }
        };
      } else if (mediaType === "image") {
        requestBody = {
          messaging_product: "whatsapp", recipient_type: input.recipientType ?? "individual", to: input.to, type: "image",
          image: { link: mediaUrl, caption: resolvedText || undefined },
          context: input.contextMessageId ? { message_id: input.contextMessageId } : undefined
        };
      } else if (mediaType === "video") {
        requestBody = {
          messaging_product: "whatsapp", recipient_type: input.recipientType ?? "individual", to: input.to, type: "video",
          video: { link: mediaUrl, caption: resolvedText || undefined },
          context: input.contextMessageId ? { message_id: input.contextMessageId } : undefined
        };
      } else if (mediaType === "audio") {
        requestBody = {
          messaging_product: "whatsapp", recipient_type: input.recipientType ?? "individual", to: input.to, type: "audio",
          audio: { link: mediaUrl },
          context: input.contextMessageId ? { message_id: input.contextMessageId } : undefined
        };
      } else {
        requestBody = {
          messaging_product: "whatsapp", recipient_type: input.recipientType ?? "individual", to: input.to, type: "document",
          document: { link: mediaUrl, caption: resolvedText || undefined, filename: input.attachment.fileName },
          context: input.contextMessageId ? { message_id: input.contextMessageId } : undefined
        };
      }
    } else if (actions.length > 0) {
      requestBody = buildInteractiveRequestBody({
        to: input.to,
        recipientType: input.recipientType ?? "individual",
        text: resolvedText,
        actions,
        contextMessageId: input.contextMessageId
      });
    } else {
      requestBody = {
        messaging_product: "whatsapp",
        recipient_type: input.recipientType ?? "individual",
        to: input.to,
        type: "text",
        text: { body: resolvedText },
        context: input.contextMessageId ? { message_id: input.contextMessageId } : undefined
      };
    }

    const response = await fetch(`https://graph.facebook.com/${platformConfig.graphApiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WhatsApp send failed: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as {
      messages?: Array<{ id?: string }>;
    };

    return {
      externalMessageId: payload.messages?.[0]?.id ?? crypto.randomUUID()
    };
  }
};

function buildInteractiveRequestBody(input: {
  to: string;
  recipientType: "individual" | "group";
  text: string;
  actions: StructuredMessageAction[];
  contextMessageId?: string;
}) {
  const bodyText = input.text || "请选择下一步";
  if (input.actions.length <= 3) {
    return {
      messaging_product: "whatsapp",
      recipient_type: input.recipientType,
      to: input.to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText.slice(0, 1024) },
        action: {
          buttons: input.actions.slice(0, 3).map((action) => ({
            type: "reply",
            reply: {
              id: action.value.slice(0, 256),
              title: action.label.slice(0, 20)
            }
          }))
        }
      },
      context: input.contextMessageId ? { message_id: input.contextMessageId } : undefined
    };
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: input.recipientType,
    to: input.to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: "查看选项",
        sections: [
          {
            title: "可选操作",
            rows: input.actions.slice(0, 10).map((action) => ({
              id: action.value.slice(0, 200),
              title: action.label.slice(0, 24),
              description: ""
            }))
          }
        ]
      }
    },
    context: input.contextMessageId ? { message_id: input.contextMessageId } : undefined
  };
}

function buildMediaPayload(message: WhatsAppRawMessage) {
  const payload = message.image ?? message.audio ?? message.video ?? message.document ?? message.sticker;
  return payload
    ? [{
        mediaId: payload.id,
        mimeType: payload.mime_type,
        fileName: "filename" in payload && typeof payload.filename === "string" ? payload.filename : undefined
      }]
    : undefined;
}

function buildActions(message: WhatsAppRawMessage) {
  const interactive = message.interactive;
  if (!interactive) {
    return [];
  }

  if (interactive.type === "button_reply" && interactive.button_reply) {
    return [
      {
        type: "button" as const,
        label: interactive.button_reply.title ?? "",
        value: interactive.button_reply.id ?? ""
      }
    ];
  }

  if (interactive.type === "list_reply" && interactive.list_reply) {
    return [
      {
        type: "list" as const,
        label: interactive.list_reply.title ?? "",
        value: interactive.list_reply.id ?? interactive.list_reply.description ?? ""
      }
    ];
  }

  return [];
}

function resolveTimestamp(timestamp: string | undefined) {
  if (!timestamp) {
    return new Date();
  }

  const numeric = Number(timestamp);
  return Number.isNaN(numeric) ? new Date(timestamp) : new Date(numeric * 1000);
}

function resolveWhatsAppMediaType(
  mimeType: string,
  fileName?: string
): "image" | "video" | "audio" | "document" | "sticker" {
  if (mimeType === "image/webp" || fileName?.toLowerCase().endsWith(".webp")) return "sticker";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
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
