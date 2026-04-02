export type AdminSession = {
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

export type MembershipSummary = {
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: string;
  isDefault: boolean;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    identityId: string;
    email: string;
    role: string;
    tenantId: string;
    tenantSlug: string;
    membershipId: string;
    agentId?: string | null;
  };
  memberships: MembershipSummary[];
};

export type OverviewData = {
  conversations: { total: number; byStatus: Record<string, number> };
  knowledgeBase: { activeEntries: number };
  agents: { total: number };
};

export type PreReplyPolicyRule = {
  ruleId: string;
  name: string;
  enabled: boolean;
  requiredChecks: string[];
  intents: string[];
  keywords: string[];
  onMissing: "handoff" | "defer";
  reason: string | null;
  augmentPreferredChecks: boolean;
};

export type PreReplyPolicySet = {
  enabled: boolean;
  rules: PreReplyPolicyRule[];
};

export type AIConfig = {
  config_id: string;
  name?: string;
  provider: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  system_prompt_override: string | null;
  has_api_key?: boolean;
  base_url?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CapabilityListItem = {
  capabilityId: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CapabilityDetail = CapabilityListItem & {
  metadata: Record<string, unknown>;
  skillMarkdown: string;
  formsMarkdown: string;
  referenceMarkdown: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  scripts: Array<{
    scriptId: string;
    scriptKey: string;
    name: string;
    fileName: string;
    language: string;
    sourceCode: string;
    requirements: string[];
    envRefs: string[];
    envBindings: Array<{
      envKey: string;
      envValue: string;
    }>;
    enabled: boolean;
  }>;
};

export type CapabilityUpsertInput = {
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status?: string | null;
  skillMarkdown?: string | null;
  formsMarkdown?: string | null;
  referenceMarkdown?: string | null;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  scripts?: Array<{
    scriptKey: string;
    name: string;
    fileName?: string | null;
    language?: string | null;
    sourceCode: string;
    requirements?: string[];
    envBindings?: Array<{
      envKey: string;
      envValue: string;
    }>;
    enabled?: boolean;
  }>;
};

export type AIConfigProfile = AIConfig & {
  name: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AIRuntimePolicy = {
  policy_id: string | null;
  tenant_id: string;
  pre_reply_policies: PreReplyPolicySet;
  model_scene_config: {
    aiSeatConfigId: string | null;
    agentAssistConfigId: string | null;
    toolDefaultConfigId: string | null;
  };
  created_at: string | null;
  updated_at: string | null;
};

export type TenantAIAgent = {
  aiAgentId: string;
  name: string;
  roleLabel: string | null;
  personality: string | null;
  scenePrompt: string | null;
  systemPrompt: string | null;
  description: string | null;
  status: "draft" | "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type TenantAIAgentListResponse = {
  summary: {
    licensedAiSeats: number;
    usedAiSeats: number;
    remainingAiSeats: number;
    aiModelAccessMode: "platform_managed" | "tenant_managed";
    aiProvider: string | null;
    aiModel: string | null;
  };
  items: TenantAIAgent[];
};

export type KBEntry = {
  entry_id: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  is_active: boolean;
  hit_count: number;
  created_at: string;
};

export type ChannelConfig = {
  config_id: string;
  channel_type: string;
  channel_id: string;
  widget_name?: string | null;
  public_channel_key?: string | null;
  allowed_origins?: string[];
  verify_token?: string | null;
  phone_number_id?: string | null;
  waba_id?: string | null;
  business_account_name?: string | null;
  display_phone_number?: string | null;
  whatsapp_webhook_url?: string | null;
  whatsapp_embedded_signup_enabled?: boolean;
  inbound_webhook_url?: string | null;
  outbound_webhook_url?: string | null;
  webhook_secret?: string | null;
  is_active: boolean;
  // WhatsApp 多实例扩展字段
  label?: string | null;
  usage_scene?: string | null;
  is_primary?: boolean | null;
  onboarding_status?: string | null;
};

export type WhatsAppEmbeddedSignupSetup = {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
  webhookUrl: string;
  graphApiVersion: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  businessAccountName: string | null;
};

export type WebChannelLinkInfo = {
  channelId: string;
  publicChannelKey: string | null;
  isActive: boolean;
  customerChatUrl: string | null;
  widgetScriptUrl: string;
  widgetEmbedSnippet: string | null;
};

export type WebhookChannelLinkInfo = {
  channelId: string;
  isActive: boolean;
  inboundWebhookUrl: string;
  outboundWebhookUrl: string | null;
};
export type ModuleItem = {
  moduleId: string;
  code: string;
  name: string;
  description: string | null;
  operatingMode: "human_first" | "ai_first" | "ai_autonomous" | "workflow_first";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type SkillGroup = {
  skill_group_id: string;
  module_id: string;
  module_name: string | null;
  code: string;
  name: string;
  priority: number;
  is_active: boolean;
};
export type RoutingRule = {
  rule_id: string;
  name: string;
  priority: number;
  is_active: boolean;
  conditions: {
    channelType?: string;
    channelId?: string;
    customerLanguage?: string;
    customerTier?: string;
  };
  actions: {
    executionMode?: "ai_first" | "human_first" | "ai_only" | "human_only" | "hybrid";
    humanTarget?: {
      departmentId?: string;
      departmentCode?: string;
      teamId?: string;
      teamCode?: string;
      skillGroupCode?: string;
      assignmentStrategy?: "round_robin" | "least_busy" | "balanced_new_case" | "sticky";
    };
    aiTarget?: {
      aiAgentId?: string;
      assignmentStrategy?: "round_robin" | "least_busy" | "sticky";
    };
    overflowPolicy?: {
      humanToAiThresholdPct?: number;
      aiToHumanThresholdPct?: number;
      aiSoftConcurrencyLimit?: number;
    };
    hybridPolicy?: {
      strategy?: "load_balanced" | "prefer_human" | "prefer_ai";
    };
    overrides?: {
      customerRequestsHuman?: "force_human" | "allow_policy";
      humanRequestKeywords?: string[];
      aiUnhandled?: "force_human" | "queue_human" | "allow_policy";
    };
    fallbackTarget?: {
      departmentId?: string;
      teamId?: string;
      skillGroupCode?: string;
      assignmentStrategy?: "round_robin" | "least_busy" | "balanced_new_case" | "sticky";
    };
  };
};

export type AIConversationListItem = {
  assignmentId: string;
  conversationId: string;
  aiAgentId: string;
  aiAgentName: string | null;
  conversationStatus: string;
  currentHandlerType: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  handoffRequired: boolean;
  handoffReason: string | null;
  customerName: string | null;
  customerRef: string | null;
  customerTier: string | null;
  channelType: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastAiResponseAt: string | null;
  updatedAt: string;
  riskLevel: "normal" | "attention" | "high";
  riskReasons: string[];
};

export type AIConversationDetail = {
  conversation: {
    conversationId: string;
    status: string;
    channelType: string;
    currentHandlerType: string | null;
    customerName: string | null;
    customerRef: string | null;
    customerTier: string | null;
    customerLanguage: string | null;
    aiAgentId: string | null;
    aiAgentName: string | null;
    assignedAgentId: string | null;
    assignedAgentName: string | null;
    handoffRequired: boolean;
    handoffReason: string | null;
    lastMessagePreview: string | null;
    lastMessageAt: string | null;
    lastAiResponseAt: string | null;
    riskLevel: "normal" | "attention" | "high";
    riskReasons: string[];
  };
  messages: Array<{
    messageId: string;
    direction: string;
    senderType: string;
    messageType: string;
    content: {
      text?: string;
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
      attachments?: Array<{ url?: string; mimeType?: string; fileName?: string; mediaId?: string }>;
    };
    preview: string;
    replyToMessageId?: string | null;
    replyToPreview?: string | null;
    reactionTargetMessageId?: string | null;
    reactionEmoji?: string | null;
    createdAt: string;
  }>;
  traces: Array<{
    traceId: string;
    supervisor: string;
    steps: unknown[];
    skillsCalled: string[];
    handoffReason: string | null;
    error?: string | null;
    totalDurationMs: number;
    createdAt: string;
  }>;
};

export type HumanConversationListItem = {
  assignmentId: string | null;
  conversationId: string;
  caseId: string | null;
  caseTitle: string | null;
  conversationStatus: string | null;
  queueStatus: string | null;
  channelType: string | null;
  customerName: string | null;
  customerRef: string | null;
  departmentId: string | null;
  departmentName: string | null;
  teamId: string | null;
  teamName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastCustomerMessageAt: string | null;
  lastServiceMessageAt: string | null;
  waitingFrom: string | null;
  waitingSeconds: number;
  ownerBucket: string | null;
  hasFirstResponse: boolean;
  reassignCount: number;
  currentResponsibleType: string | null;
  currentResponsibleId: string | null;
  currentResponsibleName: string | null;
  reservedResponsibleType: string | null;
  reservedResponsibleId: string | null;
  reservedResponsibleName: string | null;
  currentExceptionReason: string | null;
};

export type HumanConversationDetail = {
  conversation: {
    conversationId: string;
    caseId: string | null;
    caseTitle: string | null;
    caseSummary: string | null;
    caseStatus: string | null;
    caseOpenedAt: string | null;
    caseLastActivityAt: string | null;
    status: string;
    queueStatus: string | null;
    channelType: string;
    currentHandlerType: string | null;
    customerName: string | null;
    customerRef: string | null;
    customerTier: string | null;
    customerLanguage: string | null;
    currentOwnerType: string | null;
    currentOwnerId: string | null;
    currentOwnerName: string | null;
    assignedAgentId: string | null;
    assignedAgentName: string | null;
    assignedAiAgentId: string | null;
    assignedAiAgentName: string | null;
    lastMessagePreview: string | null;
    lastMessageAt: string | null;
  };
  messages: Array<{
    messageId: string;
    direction: string;
    senderType: string;
    senderName: string | null;
    messageType: string;
    content: {
      text?: string;
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
      attachments?: Array<{ url?: string; mimeType?: string; fileName?: string; mediaId?: string }>;
    };
    preview: string;
    replyToMessageId?: string | null;
    replyToPreview?: string | null;
    reactionTargetMessageId?: string | null;
    reactionEmoji?: string | null;
    createdAt: string;
  }>;
};

export type AgentSkillGroup = {
  skill_group_id: string;
  code: string;
  name: string;
  proficiency_level: number;
  can_handle_vip: boolean;
};

export type MemberListItem = {
  membershipId: string;
  identityId: string;
  email: string;
  role: string;
  status: string;
  isDefault: boolean;
  createdAt: string;
  displayName: string | null;
  employeeNo: string | null;
  phone: string | null;
  idNumber: string | null;
  resignedAt: string | null;
  /** null if this member has no agent_profile */
  agentId: string | null;
  /** null if this member has no agent_profile */
  agentDisplayName: string | null;
};

export type AgentProfile = {
  agentId: string;
  displayName: string;
  email: string;
  employeeNo?: string | null;
  status: string;
  seniorityLevel: string;
  maxConcurrency: number;
  allowAiAssist: boolean;
  role: string;
  lastSeenAt: string | null;
  skillGroups: AgentSkillGroup[];
};

export type DepartmentItem = {
  departmentId: string;
  code: string;
  name: string;
  parentDepartmentId: string | null;
  isActive: boolean;
  teamCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TeamMemberItem = {
  agentId: string;
  displayName: string;
  email: string;
  status: string;
  isPrimary: boolean;
  joinedAt: string;
};

export type TeamItem = {
  teamId: string;
  departmentId: string;
  departmentName: string;
  code: string;
  name: string;
  supervisorAgentId: string | null;
  supervisorName: string | null;
  isActive: boolean;
  memberCount: number;
  members: TeamMemberItem[];
  createdAt: string;
  updatedAt: string;
};

export type PermissionRole = "tenant_admin" | "admin" | "supervisor" | "senior_agent" | "agent" | "readonly";

export type PermissionKey =
  | "admin_console.read"
  | "admin_console.write"
  | "org.manage"
  | "agents.manage"
  | "routing.manage"
  | "channels.manage"
  | "kb.manage"
  | "ai.manage"
  | "analytics.read";

export type PermissionPolicyItem = {
  policyId: string;
  role: PermissionRole;
  permissionKey: PermissionKey;
  isAllowed: boolean;
  updatedAt: string;
};

export type PermissionPolicyResponse = {
  roles: PermissionRole[];
  permissions: PermissionKey[];
  items: PermissionPolicyItem[];
};

export type AgentPresenceItem = {
  agentId: string;
  displayName: string;
  email: string;
  status: string;
  lastSeenAt: string | null;
  activeConversations: number;
};

export type AgentPresenceSummary = {
  total: number;
  online: number;
  busy: number;
  away: number;
  offline: number;
};

export type AgentPresenceResponse = {
  summary: AgentPresenceSummary;
  items: AgentPresenceItem[];
};

export type ShiftScheduleItem = {
  shiftId: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentShiftItem = {
  id: number;
  agentId: string;
  agentName: string;
  shiftId: string | null;
  shiftCode: string | null;
  shiftName: string | null;
  shiftDate: string;
  status: "scheduled" | "off" | "leave";
  note: string | null;
};

export type SlaDefinitionItem = {
  definitionId: string;
  name: string;
  priority: string;
  firstResponseTargetSec: number;
  assignmentAcceptTargetSec: number | null;
  followUpTargetSec: number | null;
  resolutionTargetSec: number;
  conditions: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SlaTriggerAction = {
  type: "alert" | "escalate" | "reassign" | "close_case";
  mode?: "semantic" | "waiting_customer";
};

export type SlaTriggerPolicyItem = {
  triggerPolicyId: string;
  name: string;
  priority: string;
  firstResponseActions: SlaTriggerAction[];
  assignmentAcceptActions: SlaTriggerAction[];
  followUpActions: SlaTriggerAction[];
  resolutionActions: SlaTriggerAction[];
  conditions: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SlaBreachItem = {
  breachId: string;
  definitionId: string | null;
  definitionName: string | null;
  triggerPolicyId: string | null;
  triggerPolicyName: string | null;
  conversationId: string | null;
  caseId: string | null;
  agentId: string | null;
  agentName: string | null;
  metric: string;
  targetSec: number;
  actualSec: number;
  breachSec: number;
  severity: "warning" | "critical";
  status: "open" | "acknowledged" | "resolved";
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SlaBreachListResponse = {
  page: number;
  pageSize: number;
  total: number;
  summary: {
    total: number;
    open: number;
    acknowledged: number;
    resolved: number;
    avgBreachSec: number;
  };
  items: SlaBreachItem[];
};

export type QaScoringRuleItem = {
  ruleId: string;
  code: string;
  name: string;
  weight: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type QaConversationOption = {
  conversationId: string;
  caseId: string;
  status: string;
  channelType: string;
  customerName: string | null;
  customerRef: string | null;
  agentName: string | null;
  reviewed: boolean;
  updatedAt: string;
};

export type QaReviewItem = {
  reviewId: string;
  conversationId: string;
  caseId: string;
  reviewerIdentityId: string | null;
  reviewerEmail: string | null;
  agentId: string | null;
  agentName: string | null;
  conversationStatus: string | null;
  score: number;
  dimensionScores: Record<string, number>;
  tags: string[];
  note: string | null;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

export type QaReviewListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: QaReviewItem[];
};

export type CsatSurveyItem = {
  surveyId: string;
  conversationId: string;
  caseId: string | null;
  customerId: string;
  customerName: string | null;
  customerRef: string | null;
  agentId: string | null;
  agentName: string | null;
  channelType: string;
  channelId: string;
  status: "scheduled" | "sent" | "responded" | "expired" | "failed";
  scheduledAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CsatSurveyListResponse = {
  page: number;
  pageSize: number;
  total: number;
  summary: {
    total: number;
    scheduled: number;
    sent: number;
    responded: number;
    expired: number;
    failed: number;
  };
  items: CsatSurveyItem[];
};

export type CsatResponseItem = {
  responseId: string;
  surveyId: string;
  conversationId: string;
  caseId: string | null;
  customerId: string;
  customerName: string | null;
  customerRef: string | null;
  agentId: string | null;
  agentName: string | null;
  rating: number;
  feedback: string | null;
  source: string;
  respondedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CsatResponseListResponse = {
  page: number;
  pageSize: number;
  total: number;
  summary: {
    total: number;
    averageRating: number;
  };
  items: CsatResponseItem[];
};

export type SupervisorOverview = {
  waitingQueue: number;
  onlineAgents: number;
  aiProcessing: number;
  todayConversations: number;
  slaBreaches: number;
  avgCsatToday: number;
};

export type SupervisorWaitingConversation = {
  assignmentId: string;
  caseId: string | null;
  caseTitle: string | null;
  conversationId: string;
  priority: number;
  waitingFrom: string;
  waitingSeconds: number;
  conversationStatus: string;
  channelType: string;
  customerName: string | null;
  customerRef: string | null;
  skillGroupName: string | null;
  departmentName: string | null;
  teamName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type SupervisorConversationWorkbenchItem = {
  assignmentId: string | null;
  conversationId: string;
  caseId: string | null;
  caseTitle: string | null;
  conversationStatus: string | null;
  queueStatus: string | null;
  channelType: string | null;
  customerName: string | null;
  customerRef: string | null;
  departmentId: string | null;
  departmentName: string | null;
  teamId: string | null;
  teamName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastCustomerMessageAt: string | null;
  lastServiceMessageAt: string | null;
  waitingFrom: string | null;
  waitingSeconds: number;
  ownerBucket: string | null;
  hasFirstResponse: boolean;
  reassignCount: number;
  currentResponsibleType: string | null;
  currentResponsibleId: string | null;
  currentResponsibleName: string | null;
  reservedResponsibleType: string | null;
  reservedResponsibleId: string | null;
  reservedResponsibleName: string | null;
  currentExceptionReason: string | null;
};

export type SupervisorConversationWorkbenchResponse = {
  page: number;
  pageSize: number;
  total: number;
  scope?: "all" | "waiting" | "exception" | "active" | "resolved";
  items: SupervisorConversationWorkbenchItem[];
};

export type SupervisorAgentStatus = {
  agentId: string;
  displayName: string;
  email: string;
  status: string;
  lastSeenAt: string | null;
  activeConversations: number;
};

export type CustomerTagItem = {
  tagId: string;
  code: string;
  name: string;
  color: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerSegmentItem = {
  segmentId: string;
  code: string;
  name: string;
  description: string | null;
  rule: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerListItem = {
  customerId: string;
  name: string | null;
  reference: string;
  channel: string;
  tier: string;
  language: string;
  tags: Array<{ tagId: string; code: string; name: string; color: string }>;
  conversationCount: number;
  taskCount: number;
  lastContactAt: string | null;
  caseCount: number;
  openCaseCount: number;
  resolvedCaseCount: number;
  lastCaseAt: string | null;
  lastCaseId: string | null;
  lastCaseTitle: string | null;
  updatedAt: string;
};

export type CustomerListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: CustomerListItem[];
};

export type DispatchExecutionListItem = {
  executionId: string;
  caseId: string | null;
  caseTitle: string | null;
  conversationId: string;
  triggerType: string;
  triggerActorType: string | null;
  decisionType: string;
  channelType: string | null;
  channelId: string | null;
  customerName: string | null;
  customerRef: string | null;
  customerTier: string | null;
  customerLanguage: string | null;
  routingRuleName: string | null;
  decisionReason: string | null;
  decisionSummary: Record<string, unknown>;
  assignedAgentId: string | null;
  aiAgentId: string | null;
  createdAt: string;
};

export type DispatchExecutionDetail = {
  execution: {
    executionId: string;
    caseId: string | null;
    caseTitle: string | null;
    conversationId: string;
    customerName: string | null;
    customerRef: string | null;
    triggerType: string;
    triggerActorType: string | null;
    triggerActorId: string | null;
    decisionType: string;
    channelType: string | null;
    channelId: string | null;
    customerTier: string | null;
    customerLanguage: string | null;
    routingRuleId: string | null;
    routingRuleName: string | null;
    matchedConditions: Record<string, unknown>;
    inputSnapshot: Record<string, unknown>;
    decisionSummary: Record<string, unknown>;
    decisionReason: string | null;
    createdAt: string;
  };
  candidates: Array<{
    candidateType: string;
    candidateId: string | null;
    candidateLabel: string | null;
    stage: string;
    accepted: boolean;
    rejectReason: string | null;
    details: Record<string, unknown>;
    createdAt: string;
  }>;
  transitions: Array<{
    transitionId: string;
    executionId: string | null;
    transitionType: string;
    actorType: string | null;
    actorId: string | null;
    fromOwnerType: string | null;
    fromOwnerId: string | null;
    fromSegmentId: string | null;
    toOwnerType: string | null;
    toOwnerId: string | null;
    toSegmentId: string | null;
    reason: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type DispatchOpsSuggestion = {
  key: string;
  severity: "high" | "medium" | "low";
  category: string;
  title: string;
  summary: string;
  metrics: Record<string, number | string>;
  recommendation: string;
};

export type DispatchOpsSuggestionGroup = {
  aiAgents: DispatchOpsSuggestion[];
  teams: DispatchOpsSuggestion[];
  customerSegments: DispatchOpsSuggestion[];
};

export type AdminTaskComment = {
  commentId: string;
  taskId: string;
  body: string;
  isInternal: boolean;
  authorType: string;
  authorIdentityId: string | null;
  authorAgentId: string | null;
  authorName: string | null;
  authorEmployeeNo: string | null;
  createdAt: string;
};

export type AdminTaskItem = {
  taskId: string;
  caseId: string;
  conversationId: string | null;
  customerId: string | null;
  sourceMessageId: string | null;
  taskType: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  ownerAgentId: string | null;
  ownerName: string | null;
  ownerEmployeeNo: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  creatorType: string;
  creatorIdentityId: string | null;
  creatorAgentId: string | null;
  creatorName: string | null;
  creatorEmployeeNo: string | null;
  sourceMessagePreview: string | null;
  sourceMessageAuthorName: string | null;
  lastCommentedAt: string | null;
  createdAt: string;
  updatedAt: string;
  caseTitle?: string | null;
  caseStatus?: string | null;
  customerName?: string | null;
  customerRef?: string | null;
};

export type AdminTaskDetail = {
  task: AdminTaskItem;
  comments: AdminTaskComment[];
};

export type Tab =
  | "overview"
  | "cases"
  | "human-conversations"
  | "sla"
  | "qa"
  | "csat"
  | "supervisor"
  | "customers"
  | "organization"
  | "permissions"
  | "shifts"
  | "agents"
  | "ai-seats"
  | "ai-conversations"
  | "memory-qa"
  | "dispatch-audit"
  | "tasks"
  | "ai"
  | "capabilities"
  | "kb"
  | "routing"
  | "channels"
  | "analytics";

// ─── Analytics ────────────────────────────────────────────────────────────────

export type DailyReportRow = {
  date: string;
  eventType: string;
  count: number;
};

export type DailyReport = {
  tenantId: string;
  date: string;
  events: DailyReportRow[];
  summary: {
    distinctCasesTouched: number;
    conversationsStarted: number;
    messagesReceived: number;
    messagesSent: number;
    skillsExecuted: number;
    conversationsResolved: number;
    totalEvents: number;
  };
};

export type ConversationCaseItem = {
  caseId: string;
  conversationId: string;
  status: string;
  caseType: string | null;
  title: string | null;
  summary: string | null;
  channelType: string;
  customerName: string | null;
  customerRef: string | null;
  ownerType: string | null;
  ownerId: string | null;
  ownerName: string | null;
  openedAt: string;
  closedAt: string | null;
  lastActivityAt: string;
};

export type ConversationCaseListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: ConversationCaseItem[];
};

export type MemoryEncoderTraceListItem = {
  traceId: string;
  customerId: string | null;
  conversationId: string | null;
  caseId: string | null;
  taskId: string | null;
  sourceKind: string;
  status: string;
  metrics: Record<string, unknown>;
  createdAt: string;
};

export type MemoryEncoderTraceDetail = MemoryEncoderTraceListItem & {
  inputContext: Record<string, unknown>;
  eventFrame: Record<string, unknown>;
  candidateItems: Array<Record<string, unknown>>;
  reviewedItems: Array<Record<string, unknown>>;
  finalItems: Array<Record<string, unknown>>;
};

export type MemoryEvalDatasetItem = {
  datasetId: string;
  name: string;
  description: string | null;
  sampleCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MemoryEvalReportItem = {
  reportId: string;
  datasetId: string | null;
  datasetName: string | null;
  name: string;
  status: string;
  sampleCount: number;
  metrics: Record<string, unknown>;
  createdAt: string;
};

export type MemoryEvalReportDetail = {
  reportId: string;
  datasetId: string | null;
  name: string;
  status: string;
  sampleCount: number;
  metrics: Record<string, unknown>;
  report: Record<string, unknown>;
  createdAt: string;
};

export type MemoryEvalDatasetRowInput = {
  tenantId: string;
  customerId: string;
  conversationId: string;
  caseId?: string | null;
  conversationSummary: string;
  lastIntent: string;
  lastSentiment: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  goldActiveMemories: Array<{ type: string; title?: string; summary: string; detail?: string }>;
  goldStaleMemories?: Array<{ type: string; title?: string; summary: string; detail?: string }>;
  notes?: string;
};
