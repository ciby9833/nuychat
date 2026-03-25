export type MembershipSummary = {
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: string;
  isDefault: boolean;
  agentId?: string | null;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  identityId: string;
  email: string;
  role: string;
  tenantId: string;
  tenantSlug: string;
  membershipId: string;
  agentId?: string | null;
  memberships: MembershipSummary[];
};

export type ConversationItem = {
  conversationId: string;
  caseId?: string | null;
  caseStatus?: string | null;
  caseTitle?: string | null;
  channelType: string;
  status: string;
  lastMessagePreview: string | null;
  occurredAt: string;
  lastMessageAt?: string;
  unreadCount?: number;
  queueStatus?: string;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  assignedAgentEmployeeNo?: string | null;
  customerName?: string | null;
  customerTier?: string;
  customerRef?: string;
  customerTags?: string[];
  clientDevice?: string | null;
  clientSource?: string | null;
  clientAppId?: string | null;
  /** True when the current agent still has pending case work on this conversation */
  hasMyOpenTicket?: boolean;
};

export type ConversationDetail = {
  conversationId: string;
  caseId: string | null;
  caseStatus: string | null;
  caseType: string | null;
  caseTitle: string | null;
  caseSummary: string | null;
  caseOpenedAt: string | null;
  caseLastActivityAt: string | null;
  channelType: string;
  channelId: string;
  status: string;
  operatingMode: string;
  customerId: string;
  customerName: string | null;
  customerTier: string;
  customerLanguage: string;
  customerRef: string;
  assignedAgentId?: string | null;
  clientDevice?: string | null;
  clientSource?: string | null;
  clientAppId?: string | null;
};

export type MessageItem = {
  message_id: string;
  direction: string;
  sender_type: string | null;
  sender_id: string | null;
  channel_message_type?: string | null;
  message_status?: string | null;
  message_type: string;
  content: {
    text?: string;
    aiAgentName?: string | null;
    attachments?: Array<{ url?: string; mimeType?: string; fileName?: string; mediaId?: string }>;
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    contacts?: Array<{ name?: string; phones?: string[] }>;
    // Skill execution results
    skillName?: string;
    result?: Record<string, unknown>;
  };
  reply_to_message_id?: string | null;
  reply_to_external_id?: string | null;
  reply_to_content?: {
    text?: string;
    attachments?: Array<{ url?: string; mimeType?: string; fileName?: string; mediaId?: string }>;
  } | null;
  reaction_target_message_id?: string | null;
  reaction_target_external_id?: string | null;
  reaction_emoji?: string | null;
  is_forwarded?: boolean;
  is_frequently_forwarded?: boolean;
  is_voice_message?: boolean;
  status_sent_at?: string | null;
  status_delivered_at?: string | null;
  status_read_at?: string | null;
  status_failed_at?: string | null;
  status_deleted_at?: string | null;
  status_error_code?: string | null;
  status_error_title?: string | null;
  created_at: string;
  /** Populated when sender_type === "agent" via server-side join */
  sender_name?: string | null;
  sender_employee_no?: string | null;
};

export type MessageAttachment = {
  url: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
};

export type CopilotData = {
  summary: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative" | "angry";
  entities: { orderIds: string[]; phones: string[]; addresses: string[] };
  suggestions: string[];
};

export type SideView = "all" | "mine" | "pending" | "monitor" | "follow_up";

/** A colleague agent available for transfer */
export type AgentColleague = {
  agentId: string;
  displayName: string | null;
  employeeNo: string | null;
  status: string;
  lastSeenAt: string | null;
};
export type RightTab = "case" | "customer" | "copilot" | "skills" | "orders";

export type PaginatedConversationsResponse = {
  conversations: ConversationItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type RealtimeReplayEvent = {
  eventId: string;
  event: "conversation.created" | "conversation.updated" | "message.received" | "message.sent" | "message.updated" | "task.updated";
  payload: Record<string, unknown>;
};

export type ConversationListItem =
  | { kind: "header"; label: string }
  | { kind: "conversation"; data: ConversationItem };

export type SkillRecommendation = {
  skillName: string;
  installId: string;
  score: number;
  reasons: string[];
  preferred: boolean;
};

export type ConversationSkillRecommendationResponse = {
  conversationId: string;
  actorType: "ai" | "agent";
  availableSkillNames: string[];
  preferredSkillNames: string[];
  recommendations: SkillRecommendation[];
};

// ── Ticket types ───────────────────────────────────────────────────────────────

export type Ticket = {
  ticketId: string;
  conversationId: string | null;
  caseId: string | null;
  title: string;
  description: string | null;
  status: "queued" | "running" | "published" | "failed";
  priority: "normal";
  assigneeId: string | null;
  slaDeadlineAt: string | null;
  slaStatus: "none";
  resolvedAt: string | null;
  closedAt: string | null;
  createdByType: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketNote = {
  noteId: string;
  ticketId: string;
  body: string;
  isInternal: boolean;
  authorType: string;
  authorId: string | null;
  createdAt: string;
};

export type SkillExecuteResult = {
  skillName: string;
  result: Record<string, unknown>;
  messageId: string;
};

// ── Skill schema types ──────────────────────────────────────────────────────

export type SkillSchemaParam = {
  type: string;
  description?: string;
  enum?: string[];
};

export type SkillSchema = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, SkillSchemaParam>;
    required?: string[];
  };
};

// ── Customer 360 types ───────────────────────────────────────────────────────

export type Customer360Data = {
  customer: {
    customerId: string;
    name: string | null;
    reference: string;
    tier: string;
    language: string;
    timezone: string;
    channelType: string;
    channelId: string;
    tags: string[];
    metadata: Record<string, unknown>;
    firstContactAt: string;
    updatedAt: string;
  };
  history: Array<{
    caseId: string;
    caseTitle: string | null;
    caseType: string | null;
    conversationId: string;
    channelType: string;
    status: string;
    summary: string | null;
    intent: string | null;
    sentiment: string | null;
    occurredAt: string;
  }>;
  orderClues: string[];
  customerTickets: Array<{
    ticketId: string;
    caseId: string | null;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
  }>;
  sentimentTrend: Array<{
    caseId: string;
    sentiment: string;
    occurredAt: string;
  }>;
  aiAnalysis: {
    summary: string;
    intent: string;
    sentiment: "positive" | "neutral" | "negative" | "angry";
    suggestions: string[];
  };
  knowledgeRecommendations: Array<{
    entryId: string;
    title: string;
    category: string;
    hitCount: number;
    updatedAt: string;
  }>;
};

// ── AI Trace types ──────────────────────────────────────────────────────────────

export type AiTraceStep = {
  step: string;
  output?: unknown;
  toolName?: string;
  durationMs?: number;
};

export type AiTrace = {
  traceId: string;
  supervisor: string;
  steps: AiTraceStep[];
  skillsCalled: string[];
  tokenUsage: { prompt: number; completion: number; total: number };
  totalDurationMs: number;
  handoffReason: string | null;
  error: string | null;
  createdAt: string;
};
