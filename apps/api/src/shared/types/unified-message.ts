export type UnifiedMessageType =
  | "text"
  | "media"
  | "interactive"
  | "location"
  | "contacts"
  | "reaction"
  | "system_event";

export type UnifiedMessage = {
  id: string;
  externalId: string;
  tenantId: string;
  channelId: string;
  channelType: string;
  direction: "inbound" | "outbound";
  messageType: UnifiedMessageType;
  senderExternalRef: string;
  recipientExternalRef?: string;
  text?: string;
  media?: {
    url?: string;
    mimeType?: string;
    fileName?: string;
    mediaId?: string;
  };
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
