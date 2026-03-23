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
  dataUrl?: string;
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
  attachments?: WebchatAttachment[];
  createdAt: string;
};

export type WebchatMessagesResponse = {
  conversationId: string | null;
  messages: WebchatMessage[];
};
