export type WebchatClientContext = {
  source?: string;
  appId?: string | null;
  deviceType?: "desktop" | "mobile" | "tablet";
  platform?: string | null;
  userAgent?: string | null;
  language?: string | null;
  timezone?: string | null;
  viewport?: { width: number; height: number };
  pageUrl?: string | null;
  referrer?: string | null;
};

export type WebchatAttachment = {
  name: string;
  mimeType: string;
  size: number;
  url?: string;
};

export type WebchatSession = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  channelId: string;
  publicChannelKey: string;
  customerRef: string;
  displayName: string | null;
  conversationId: string;
  client: WebchatClientContext;
};

export type WebchatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  text: string;
  structured?: {
    version: "2026-03-28";
    blocks: Array<
      | { type: "paragraph"; text: string }
      | { type: "list"; ordered: boolean; items: string[] }
      | { type: "key_value"; items: Array<{ label: string; value: string }> }
      | {
          type: "records";
          items: Array<{ title?: string; fields: Array<{ label: string; value: string }> }>;
        }
    >;
  } | null;
  actions?: Array<{ type?: "button" | "list" | "postback"; label: string; value: string }>;
  attachments?: WebchatAttachment[];
  createdAt: string;
};

export type WebchatMessagesResponse = {
  conversationId: string | null;
  messages: WebchatMessage[];
};
