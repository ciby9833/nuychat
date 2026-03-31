export type UnifiedMessageType =
  | "text"
  | "media"
  | "interactive"
  | "location"
  | "contacts"
  | "reaction"
  | "system_event";

export type UnifiedAttachment = {
  url?: string;
  mimeType?: string;
  fileName?: string;
  mediaId?: string;
};

export type UnifiedMessageContext = {
  externalMessageId?: string;
  forwarded?: boolean;
  frequentlyForwarded?: boolean;
};

export type UnifiedReaction = {
  emoji?: string;
  targetExternalMessageId?: string;
};

export type UnifiedMessage = {
  id: string;
  externalId: string;
  tenantId: string;
  channelId: string;
  channelType: string;
  chatType: "direct" | "group";
  chatExternalRef: string;
  chatName?: string;
  direction: "inbound" | "outbound";
  messageType: UnifiedMessageType;
  senderExternalRef: string;
  participantExternalRef?: string;
  participantDisplayName?: string;
  recipientExternalRef?: string;
  text?: string;
  attachments?: UnifiedAttachment[];
  context?: UnifiedMessageContext;
  reaction?: UnifiedReaction;
  actions?: Array<{
    type: "button" | "list" | "postback";
    label: string;
    value: string;
  }>;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: Array<{
    name?: string;
    phones?: string[];
  }>;
  metadata?: Record<string, unknown>;
  receivedAt: Date;
};
