// ─── Primitive enums ──────────────────────────────────────────────────────────

export type OperatingMode = "ai_first" | "human_first" | "ai_autonomous" | "workflow_first";

export type ChannelType = "whatsapp" | "wechat" | "line" | "web" | "email";

export type MessageDirection = "inbound" | "outbound";

export type MessageType =
  | "text"
  | "media"
  | "interactive"
  | "location"
  | "contacts"
  | "reaction"
  | "system_event";

export type ConversationStatus =
  | "open"
  | "queued"
  | "bot_active"
  | "human_active"
  | "workflow_active"
  | "resolved"
  | "closed";

export type AgentStatus = "online" | "away" | "busy" | "offline";

export type UserRole = "platform_admin" | "tenant_admin" | "supervisor" | "agent";

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  slug: string;
  operatingMode: OperatingMode;
  aiConfig: {
    source: "platform" | "own";
    provider: string;
    model: string;
  };
  quotas: {
    aiTokenLimit: number | null;
    aiQuotaUsed: number;
  };
}

// ─── Unified message ──────────────────────────────────────────────────────────

export interface UnifiedMessage {
  id: string;
  externalId: string;
  tenantId: string;
  channelId: string;
  channelType: ChannelType;
  direction: MessageDirection;
  messageType: MessageType;
  senderExternalRef: string;
  recipientExternalRef: string;
  receivedAt: string;
  text?: string;
  media?: {
    url?: string;
    mimeType?: string;
    fileName?: string;
    mediaId?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: Array<{ name: string; phones?: string[] }>;
  metadata?: Record<string, unknown>;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export type RoutingStrategy = "round_robin" | "least_busy" | "sticky";

export interface AssignmentDecision {
  moduleId: string | null;
  skillGroupId: string | null;
  assignedAgentId: string | null;
  strategy: RoutingStrategy;
  priority: number;
  status: "pending" | "assigned";
  reason: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export type Sentiment = "positive" | "neutral" | "negative" | "angry";

export interface OrchestratorResult {
  /** Generated reply text; null means no AI response — defer to human */
  response: string | null;
  intent: string;
  sentiment: Sentiment;
  shouldHandoff: boolean;
  handoffReason?: string;
  tokensUsed: number;
  confidence: number;
}

// ─── Realtime events ─────────────────────────────────────────────────────────

export interface ConversationCreatedEvent {
  tenantId: string;
  conversationId: string;
  customerId: string;
  channelId: string;
  channelType: string;
  lastMessagePreview: string | null;
  occurredAt: string;
}

export interface ConversationUpdatedEvent {
  tenantId: string;
  conversationId: string;
  unreadCount?: number;
  lastMessagePreview?: string | null;
  status?: ConversationStatus;
  queueStatus?: string;
  assignedAgentId?: string | null;
  skillGroupId?: string | null;
  occurredAt: string;
}

export interface MessageReceivedEvent {
  tenantId: string;
  conversationId: string;
  messageId: string;
  externalId: string;
  messageType: MessageType;
  text?: string;
  senderExternalRef: string;
  occurredAt: string;
}

export interface MessageSentEvent {
  tenantId: string;
  conversationId: string;
  messageId: string;
  text?: string;
  senderId?: string;
  occurredAt: string;
}

export * from "./ai-model-config";
