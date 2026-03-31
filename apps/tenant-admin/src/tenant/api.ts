import { clearTenantSession, readTenantSession } from "./session";
import type {
  AgentPresenceResponse,
  AgentShiftItem,
  AIRuntimePolicy,
  AdminSession,
  AIConfig,
  AIConfigProfile,
  AIConversationDetail,
  AIConversationListItem,
  HumanConversationDetail,
  HumanConversationListItem,
  TenantAIAgent,
  TenantAIAgentListResponse,
  AgentProfile,
  AdminTaskDetail,
  AdminTaskItem,
  DailyReport,
  ConversationCaseListResponse,
  MemberListItem,
  ModuleItem,
  DepartmentItem,
  PreReplyPolicySet,
  LoginResponse,
  PermissionPolicyResponse,
  QaConversationOption,
  QaReviewListResponse,
  QaReviewItem,
  QaScoringRuleItem,
  CustomerListResponse,
  CustomerSegmentItem,
  CustomerTagItem,
  DispatchExecutionDetail,
  DispatchExecutionListItem,
  DispatchOpsSuggestion,
  DispatchOpsSuggestionGroup,
  MemoryEncoderTraceDetail,
  MemoryEncoderTraceListItem,
  MemoryEvalDatasetItem,
  MemoryEvalDatasetRowInput,
  MemoryEvalReportDetail,
  MemoryEvalReportItem,
  SupervisorAgentStatus,
  SupervisorConversationWorkbenchItem,
  SupervisorConversationWorkbenchResponse,
  SupervisorOverview,
  SupervisorWaitingConversation,
  CsatResponseListResponse,
  CsatSurveyListResponse,
  WebChannelLinkInfo,
  WebhookChannelLinkInfo,
  WhatsAppEmbeddedSignupSetup,
  SlaBreachListResponse,
  SlaDefinitionItem,
  SlaTriggerPolicyItem,
  ShiftScheduleItem,
  RoutingRule,
  SkillGroup,
  TeamItem
} from "./types";

const SESSION_KEY = "nuychat.authSession";

export const API_BASE = readRequiredEnv("VITE_API_BASE_URL");

function readRequiredEnv(name: "VITE_API_BASE_URL"): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.replace(/\/$/, "");
}

// ─── Session-update registry ──────────────────────────────────────────────────
// DashboardPage registers its setSession() here so the refresh interceptor
// can keep React state in sync without prop drilling.
let _sessionUpdater: ((s: AdminSession) => void) | null = null;

export function registerTenantSessionUpdater(fn: (s: AdminSession) => void): void {
  _sessionUpdater = fn;
}

export function unregisterTenantSessionUpdater(): void {
  _sessionUpdater = null;
}

// ─── Silent refresh ────────────────────────────────────────────────────────────
let _refreshInFlight: Promise<AdminSession | null> | null = null;

export class TenantApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "TenantApiError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

function goToLogin(): void {
  clearTenantSession();
  window.location.href = "/";
}

async function tryRefresh(session: AdminSession): Promise<AdminSession | null> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken })
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      // Merge new tokens into existing session — all other fields remain unchanged
      const next: AdminSession = { ...session, accessToken: data.accessToken, refreshToken: data.refreshToken };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      _sessionUpdater?.(next);
      return next;
    } catch {
      return null;
    } finally {
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
}

// ─── Core api helper ──────────────────────────────────────────────────────────
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readTenantSession();
  if (!session?.accessToken) {
    goToLogin();
    throw new Error("Not authenticated");
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${session.accessToken}` };
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) }
  });

  // On 401: attempt silent token refresh once, then retry
  if (res.status === 401) {
    const next = await tryRefresh(session);
    if (next) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${next.accessToken}` };
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...retryHeaders, ...(init?.headers ?? {}) }
      });
    } else {
      goToLogin();
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    let payload: { error?: string; message?: string } | null = null;
    try {
      payload = await res.json() as { error?: string; message?: string };
    } catch {
      payload = null;
    }

    throw new TenantApiError(
      payload?.message?.trim() || `${res.status} ${res.statusText}`,
      { code: payload?.error, status: res.status }
    );
  }
  return res.json() as Promise<T>;
}

export async function loginTenant(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as LoginResponse;
}

export async function switchTenant(accessToken: string, membershipId: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/switch-tenant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ membershipId })
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as LoginResponse;
}

export async function logoutTenant(session: AdminSession): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ allSessions: false })
  });
}

export function getTenantAIConfig() {
  return api<AIConfig>("/api/admin/ai-config");
}

export function listTenantAIAgents() {
  return api<TenantAIAgentListResponse>("/api/admin/ai-agents");
}

export function listAIConversations(input?: {
  aiAgentId?: string;
  status?: string;
  datePreset?: "today" | "yesterday" | "last7d" | "custom";
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (input?.aiAgentId) params.set("aiAgentId", input.aiAgentId);
  if (input?.status) params.set("status", input.status);
  if (input?.datePreset) params.set("datePreset", input.datePreset);
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  const query = params.toString();
  return api<{ items: AIConversationListItem[] }>(`/api/admin/ai-conversations${query ? `?${query}` : ""}`);
}

export function getAIConversationDetail(conversationId: string) {
  return api<AIConversationDetail>(`/api/admin/ai-conversations/${conversationId}`);
}

export function listHumanConversations(input?: {
  agentId?: string;
  scope?: "all" | "waiting" | "exception" | "active" | "resolved";
  datePreset?: "today" | "yesterday" | "last7d" | "custom";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.agentId) params.set("agentId", input.agentId);
  if (input?.scope) params.set("scope", input.scope);
  if (input?.datePreset) params.set("datePreset", input.datePreset);
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  if (input?.page) params.set("page", String(input.page));
  if (input?.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return api<{ page: number; pageSize: number; total: number; scope: string; items: HumanConversationListItem[] }>(
    `/api/admin/human-conversations${query ? `?${query}` : ""}`
  );
}

export function getHumanConversationDetail(conversationId: string) {
  return api<HumanConversationDetail>(`/api/admin/human-conversations/${conversationId}`);
}

export function listAdminTasks(input?: {
  status?: string;
  ownerAgentId?: string;
  from?: string;
  to?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.ownerAgentId) params.set("ownerAgentId", input.ownerAgentId);
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  if (input?.search) params.set("search", input.search);
  const query = params.toString();
  return api<{ items: AdminTaskItem[] }>(`/api/admin/tasks${query ? `?${query}` : ""}`);
}

export function getAdminTaskDetail(taskId: string) {
  return api<AdminTaskDetail>(`/api/admin/tasks/${taskId}`);
}

export function patchAdminTask(
  taskId: string,
  input: {
    status?: string;
    priority?: string;
    assigneeAgentId?: string | null;
    dueAt?: string | null;
    note?: string;
  }
) {
  return api<AdminTaskDetail>(`/api/admin/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function addAdminTaskComment(taskId: string, body: string) {
  return api<AdminTaskDetail>(`/api/admin/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export function listDispatchExecutions(input?: {
  caseId?: string;
  conversationId?: string;
  triggerType?: string;
  decisionType?: string;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (input?.caseId) params.set("caseId", input.caseId);
  if (input?.conversationId) params.set("conversationId", input.conversationId);
  if (input?.triggerType) params.set("triggerType", input.triggerType);
  if (input?.decisionType) params.set("decisionType", input.decisionType);
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  const query = params.toString();
  return api<{ items: DispatchExecutionListItem[] }>(`/api/admin/dispatch-executions${query ? `?${query}` : ""}`);
}

export function getDispatchExecutionDetail(executionId: string) {
  return api<DispatchExecutionDetail>(`/api/admin/dispatch-executions/${executionId}`);
}

export function listMemoryEncoderTraces(input?: {
  conversationId?: string;
  customerId?: string;
  sourceKind?: string;
  status?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input?.conversationId) params.set("conversationId", input.conversationId);
  if (input?.customerId) params.set("customerId", input.customerId);
  if (input?.sourceKind) params.set("sourceKind", input.sourceKind);
  if (input?.status) params.set("status", input.status);
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));
  const query = params.toString();
  return api<{ summary: { recent7dCount: number }; items: MemoryEncoderTraceListItem[] }>(
    `/api/admin/memory/encoder-traces${query ? `?${query}` : ""}`
  );
}

export function getMemoryEncoderTraceDetail(traceId: string) {
  return api<MemoryEncoderTraceDetail>(`/api/admin/memory/encoder-traces/${traceId}`);
}

export function listMemoryEvalDatasets() {
  return api<{ items: MemoryEvalDatasetItem[] }>("/api/admin/memory/eval-datasets");
}

export function createMemoryEvalDataset(input: {
  name: string;
  description?: string | null;
  rows: MemoryEvalDatasetRowInput[];
}) {
  return api<MemoryEvalDatasetItem>("/api/admin/memory/eval-datasets", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listMemoryEvalReports() {
  return api<{ items: MemoryEvalReportItem[] }>("/api/admin/memory/eval-reports");
}

export function getMemoryEvalReportDetail(reportId: string) {
  return api<MemoryEvalReportDetail>(`/api/admin/memory/eval-reports/${reportId}`);
}

export function runMemoryEvalDataset(datasetId: string, input?: { name?: string }) {
  return api<MemoryEvalReportItem>(`/api/admin/memory/eval-datasets/${datasetId}/run`, {
    method: "POST",
    body: JSON.stringify(input ?? {})
  });
}

export function listDispatchOpsSuggestions(input?: { from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  const query = params.toString();
  return api<{ summary: { executions: number; transitions: number; suggestions: number }; groups: DispatchOpsSuggestionGroup }>(
    `/api/admin/dispatch-ops-suggestions${query ? `?${query}` : ""}`
  );
}

export function createTenantAIAgent(input: {
  name: string;
  roleLabel?: string | null;
  personality?: string | null;
  scenePrompt?: string | null;
  systemPrompt?: string | null;
  description?: string | null;
  status?: "draft" | "active" | "inactive";
}) {
  return api<TenantAIAgent>("/api/admin/ai-agents", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchTenantAIAgent(aiAgentId: string, input: {
  name?: string;
  roleLabel?: string | null;
  personality?: string | null;
  scenePrompt?: string | null;
  systemPrompt?: string | null;
  description?: string | null;
  status?: "draft" | "active" | "inactive";
}) {
  return api<TenantAIAgent>(`/api/admin/ai-agents/${aiAgentId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteTenantAIAgent(aiAgentId: string) {
  return api<{ deleted: boolean; aiAgentId: string }>(`/api/admin/ai-agents/${aiAgentId}`, {
    method: "DELETE"
  });
}

export function listTenantAIConfigs() {
  return api<{ configs: AIConfigProfile[] }>("/api/admin/ai-configs");
}

export function createTenantAIConfig(input: {
  name?: string;
  provider?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  systemPromptOverride?: string | null;
  encryptedApiKey?: string;
  baseUrl?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
}) {
  return api<AIConfigProfile>("/api/admin/ai-configs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchTenantAIConfig(configId: string, input: {
  name?: string;
  provider?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  systemPromptOverride?: string | null;
  encryptedApiKey?: string;
  baseUrl?: string | null;
  isActive?: boolean;
}) {
  return api<{ updated: boolean; config_id: string }>(`/api/admin/ai-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function setDefaultTenantAIConfig(configId: string) {
  return api<{ updated: boolean; config_id: string }>(`/api/admin/ai-configs/${configId}/set-default`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function deleteTenantAIConfig(configId: string) {
  return api<{ deleted: boolean; config_id: string }>(`/api/admin/ai-configs/${configId}`, {
    method: "DELETE"
  });
}

export function getTenantAIRuntimePolicy() {
  return api<AIRuntimePolicy>("/api/admin/ai-runtime-policy");
}

export function patchTenantAIRuntimePolicy(input: {
  preReplyPolicies?: PreReplyPolicySet;
  modelSceneConfig?: {
    aiSeatConfigId?: string | null;
    agentAssistConfigId?: string | null;
    toolDefaultConfigId?: string | null;
  };
}) {
  return api<AIRuntimePolicy>("/api/admin/ai-runtime-policy", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function listCapabilities() {
  return api<{ items: import("./types").CapabilityListItem[] }>("/api/admin/capabilities");
}

export async function getCapabilityDetail(capabilityId: string) {
  return api<import("./types").CapabilityDetail>(`/api/admin/capabilities/${capabilityId}`);
}

export async function createCapability(input: import("./types").CapabilityUpsertInput) {
  return api<import("./types").CapabilityDetail>("/api/admin/capabilities", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function patchCapability(capabilityId: string, input: Partial<import("./types").CapabilityUpsertInput>) {
  return api<import("./types").CapabilityDetail>(`/api/admin/capabilities/${capabilityId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteCapability(capabilityId: string) {
  return api<{ deleted: boolean; capabilityId: string }>(`/api/admin/capabilities/${capabilityId}`, {
    method: "DELETE"
  });
}

export function getTenantAnalyticsDailyReport(date: string) {
  return api<DailyReport>(`/api/admin/analytics/daily?date=${encodeURIComponent(date)}`);
}

export function listConversationCases(input?: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.search) params.set("search", input.search);
  if (input?.page) params.set("page", String(input.page));
  if (input?.pageSize) params.set("pageSize", String(input.pageSize));
  return api<ConversationCaseListResponse>(`/api/admin/conversation-cases${params.toString() ? `?${params}` : ""}`);
}

export function listDepartments() {
  return api<DepartmentItem[]>("/api/admin/departments");
}

export function listModules() {
  return api<ModuleItem[]>("/api/admin/modules");
}

export function createModule(input: {
  code: string;
  name: string;
  description?: string | null;
  operatingMode?: "human_first" | "ai_first" | "ai_autonomous" | "workflow_first";
  isActive?: boolean;
}) {
  return api<ModuleItem>("/api/admin/modules", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchModule(moduleId: string, input: Partial<{
  code: string;
  name: string;
  description: string | null;
  operatingMode: "human_first" | "ai_first" | "ai_autonomous" | "workflow_first";
  isActive: boolean;
}>) {
  return api<{ updated: boolean; moduleId: string }>(`/api/admin/modules/${moduleId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteModule(moduleId: string) {
  return api<{ deleted: boolean; moduleId: string }>(`/api/admin/modules/${moduleId}`, {
    method: "DELETE"
  });
}

export function listRoutingRules() {
  return api<RoutingRule[]>("/api/admin/routing-rules");
}

export function createRoutingRule(input: {
  name: string;
  priority: number;
  conditions: RoutingRule["conditions"];
  actions: RoutingRule["actions"];
  isActive: boolean;
}) {
  return api<{ ruleId: string }>("/api/admin/routing-rules", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchRoutingRule(
  ruleId: string,
  input: Partial<{
    name: string;
    priority: number;
    conditions: RoutingRule["conditions"];
    actions: RoutingRule["actions"];
    isActive: boolean;
  }>
) {
  return api<{ updated: boolean; ruleId: string }>(`/api/admin/routing-rules/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteRoutingRule(ruleId: string) {
  return api<{ deleted: boolean; ruleId: string }>(`/api/admin/routing-rules/${ruleId}`, {
    method: "DELETE"
  });
}

export function listSkillGroups() {
  return api<SkillGroup[]>("/api/admin/skill-groups");
}

export function createSkillGroup(input: {
  moduleId: string;
  code: string;
  name: string;
  priority?: number;
  isActive?: boolean;
}) {
  return api<SkillGroup>("/api/admin/skill-groups", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchSkillGroup(skillGroupId: string, input: Partial<{
  moduleId: string;
  code: string;
  name: string;
  priority: number;
  isActive: boolean;
}>) {
  return api<{ updated: boolean; skillGroupId: string }>(`/api/admin/skill-groups/${skillGroupId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteSkillGroup(skillGroupId: string) {
  return api<{ deleted: boolean; skillGroupId: string }>(`/api/admin/skill-groups/${skillGroupId}`, {
    method: "DELETE"
  });
}

export function getWebChannelLinkInfo() {
  return api<WebChannelLinkInfo>("/api/admin/channel-configs/web-link");
}

export function getWebhookChannelLinkInfo(configId: string) {
  return api<WebhookChannelLinkInfo>(`/api/admin/channel-configs/webhook-link/${configId}`);
}

export function getWhatsAppEmbeddedSignupSetup() {
  return api<WhatsAppEmbeddedSignupSetup>("/api/admin/channel-configs/whatsapp/setup");
}

export function completeWhatsAppEmbeddedSignup(configId: string, input: {
  phoneNumberId: string;
  wabaId?: string;
  businessAccountName?: string;
  displayPhoneNumber?: string;
}) {
  return api(`/api/admin/channel-configs/${configId}/whatsapp/embedded-signup/complete`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createDepartment(input: {
  code: string;
  name: string;
  parentDepartmentId?: string | null;
  isActive?: boolean;
}) {
  return api<DepartmentItem>("/api/admin/departments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listTeams(departmentId?: string) {
  const params = new URLSearchParams();
  if (departmentId) params.set("departmentId", departmentId);
  const q = params.toString();
  return api<TeamItem[]>(`/api/admin/teams${q ? `?${q}` : ""}`);
}

export function createTeam(input: {
  departmentId: string;
  code: string;
  name: string;
  supervisorAgentId?: string | null;
  isActive?: boolean;
}) {
  return api<TeamItem>("/api/admin/teams", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function addTeamMember(teamId: string, input: { agentId: string; isPrimary?: boolean }) {
  return api<{ assigned: boolean; teamId: string; agentId: string }>(`/api/admin/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function removeTeamMember(teamId: string, agentId: string) {
  return api<{ removed: boolean; teamId: string; agentId: string }>(`/api/admin/teams/${teamId}/members/${agentId}`, {
    method: "DELETE"
  });
}

export function listMembers() {
  return api<MemberListItem[]>("/api/admin/members");
}

export function createMember(input: {
  email: string;
  password: string;
  displayName: string;
  employeeNo?: string | null;
  phone?: string | null;
  idNumber?: string | null;
  role?: string;
  status?: string;
}) {
  return api<{ membershipId: string; email: string; created: boolean }>("/api/admin/members", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchMember(membershipId: string, input: {
  role?: string;
  status?: string;
  displayName?: string;
  employeeNo?: string | null;
  phone?: string | null;
  idNumber?: string | null;
}) {
  return api<{ updated: boolean; membershipId: string }>(`/api/admin/members/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function resignMember(membershipId: string) {
  return api<{ resigned: boolean; membershipId: string }>(`/api/admin/members/${membershipId}/resign`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function resetMemberPassword(membershipId: string, password: string) {
  return api<{ reset: boolean; membershipId: string }>(`/api/admin/members/${membershipId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function listAgents() {
  return api<AgentProfile[]>("/api/admin/agents");
}

export function createAgent(input: {
  membershipId?: string;
  email?: string;
  password?: string;
  displayName?: string;
  role?: string;
  seniorityLevel?: string;
  maxConcurrency?: number;
  allowAiAssist?: boolean;
}) {
  return api<{ agentId: string; email: string; created: boolean }>("/api/admin/agents", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchAgent(agentId: string, input: Partial<{
  status: string;
  maxConcurrency: number;
  seniorityLevel: string;
  displayName: string;
  allowAiAssist: boolean;
}>) {
  return api<{ updated: boolean }>(`/api/admin/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function removeAgent(agentId: string) {
  return api<{ removed: boolean; agentId: string }>(`/api/admin/agents/${agentId}`, {
    method: "DELETE"
  });
}

export function addAgentSkill(agentId: string, skillGroupId: string) {
  return api<{ assigned: boolean }>(`/api/admin/agents/${agentId}/skills`, {
    method: "POST",
    body: JSON.stringify({ skillGroupId })
  });
}

export function removeAgentSkill(agentId: string, skillGroupId: string) {
  return api<{ removed: boolean }>(`/api/admin/agents/${agentId}/skills/${skillGroupId}`, {
    method: "DELETE"
  });
}

export function listPermissionPolicies() {
  return api<PermissionPolicyResponse>("/api/admin/permission-policies");
}

export function updatePermissionPolicies(
  updates: Array<{ role: string; permissionKey: string; isAllowed: boolean }>
) {
  return api<{ updated: boolean; count: number }>("/api/admin/permission-policies", {
    method: "PUT",
    body: JSON.stringify({ updates })
  });
}

export function getAgentPresence() {
  return api<AgentPresenceResponse>("/api/admin/agent-presence");
}

export function listShiftSchedules() {
  return api<ShiftScheduleItem[]>("/api/admin/shift-schedules");
}

export function createShiftSchedule(input: {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  isActive?: boolean;
}) {
  return api<ShiftScheduleItem>("/api/admin/shift-schedules", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listAgentShifts(input?: { from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  const query = params.toString();
  return api<AgentShiftItem[]>(`/api/admin/agent-shifts${query ? `?${query}` : ""}`);
}

export function upsertAgentShift(input: {
  agentId: string;
  shiftId?: string | null;
  shiftDate: string;
  status?: "scheduled" | "off" | "leave";
  note?: string;
}) {
  return api<{ id: number }>("/api/admin/agent-shifts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateShiftSchedule(shiftId: string, input: {
  name?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  isActive?: boolean;
}) {
  return api<ShiftScheduleItem>(`/api/admin/shift-schedules/${shiftId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteShiftSchedule(shiftId: string) {
  return api<{ deleted: boolean }>(`/api/admin/shift-schedules/${shiftId}`, {
    method: "DELETE"
  });
}

export function bulkUpsertAgentShifts(items: Array<{
  agentId: string;
  shiftId?: string | null;
  shiftDate: string;
  status?: "scheduled" | "off" | "leave";
  note?: string;
}>) {
  return api<{ saved: number }>("/api/admin/agent-shifts/bulk", {
    method: "POST",
    body: JSON.stringify({ items })
  });
}

export function startAgentBreak(input: { agentId: string; breakType?: "break" | "lunch" | "training"; note?: string }) {
  return api<{ breakId: string }>("/api/admin/agent-breaks", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function endAgentBreak(agentId: string) {
  return api<{ ended: boolean }>("/api/admin/agent-breaks", {
    method: "POST",
    body: JSON.stringify({ agentId, endCurrent: true })
  });
}

export function listSlaDefinitions(input?: { active?: boolean; priority?: string }) {
  const params = new URLSearchParams();
  if (typeof input?.active === "boolean") params.set("active", String(input.active));
  if (input?.priority) params.set("priority", input.priority);
  const query = params.toString();
  return api<SlaDefinitionItem[]>(`/api/admin/sla-definitions${query ? `?${query}` : ""}`);
}

export function createSlaDefinition(input: {
  name: string;
  priority: string;
  firstResponseTargetSec: number;
  assignmentAcceptTargetSec?: number | null;
  followUpTargetSec?: number | null;
  resolutionTargetSec: number;
  isActive?: boolean;
  conditions?: Record<string, unknown>;
}) {
  return api<SlaDefinitionItem>("/api/admin/sla-definitions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchSlaDefinition(
  definitionId: string,
  input: Partial<{
    name: string;
    priority: string;
    firstResponseTargetSec: number;
    assignmentAcceptTargetSec: number | null;
    followUpTargetSec: number | null;
    resolutionTargetSec: number;
    isActive: boolean;
    conditions: Record<string, unknown>;
  }>
) {
  return api<SlaDefinitionItem>(`/api/admin/sla-definitions/${definitionId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listSlaTriggerPolicies(input?: { active?: boolean; priority?: string }) {
  const params = new URLSearchParams();
  if (typeof input?.active === "boolean") params.set("active", String(input.active));
  if (input?.priority) params.set("priority", input.priority);
  const query = params.toString();
  return api<SlaTriggerPolicyItem[]>(`/api/admin/sla-trigger-policies${query ? `?${query}` : ""}`);
}

export function createSlaTriggerPolicy(input: {
  name: string;
  priority: string;
  firstResponseActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
  assignmentAcceptActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
  followUpActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
  resolutionActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
  isActive?: boolean;
  conditions?: Record<string, unknown>;
}) {
  return api<SlaTriggerPolicyItem>("/api/admin/sla-trigger-policies", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchSlaTriggerPolicy(
  triggerPolicyId: string,
  input: Partial<{
    name: string;
    priority: string;
    firstResponseActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
    assignmentAcceptActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
    followUpActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
    resolutionActions: Array<{ type: "alert" | "escalate" | "reassign" | "close_case"; mode?: "semantic" | "waiting_customer" }>;
    isActive: boolean;
    conditions: Record<string, unknown>;
  }>
) {
  return api<SlaTriggerPolicyItem>(`/api/admin/sla-trigger-policies/${triggerPolicyId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listSlaBreaches(input?: {
  status?: "open" | "acknowledged" | "resolved";
  metric?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.metric) params.set("metric", input.metric);
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  if (input?.page) params.set("page", String(input.page));
  if (input?.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return api<SlaBreachListResponse>(`/api/admin/sla-breaches${query ? `?${query}` : ""}`);
}

export function patchSlaBreachStatus(breachId: string, status: "open" | "acknowledged" | "resolved") {
  return api<{ breachId: string; status: string }>(`/api/admin/sla-breaches/${breachId}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function listQaScoringRules() {
  return api<QaScoringRuleItem[]>("/api/admin/qa/scoring-rules");
}

export function updateQaScoringRules(
  rules: Array<{ code: string; name: string; weight: number; isActive?: boolean; sortOrder?: number }>
) {
  return api<{ updated: boolean; count: number }>("/api/admin/qa/scoring-rules", {
    method: "PUT",
    body: JSON.stringify({ rules })
  });
}

export function listQaConversations(input?: { search?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (input?.search) params.set("search", input.search);
  if (input?.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return api<QaConversationOption[]>(`/api/admin/qa/conversations${query ? `?${query}` : ""}`);
}

export function listQaReviews(input?: {
  agentId?: string;
  tag?: string;
  minScore?: number;
  maxScore?: number;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.agentId) params.set("agentId", input.agentId);
  if (input?.tag) params.set("tag", input.tag);
  if (input?.minScore !== undefined) params.set("minScore", String(input.minScore));
  if (input?.maxScore !== undefined) params.set("maxScore", String(input.maxScore));
  if (input?.page !== undefined) params.set("page", String(input.page));
  if (input?.pageSize !== undefined) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return api<QaReviewListResponse>(`/api/admin/qa/reviews${query ? `?${query}` : ""}`);
}

export function createQaReview(input: {
  conversationId: string;
  caseId?: string;
  score: number;
  dimensionScores?: Record<string, number>;
  tags?: string[];
  note?: string;
  status?: "draft" | "published";
}) {
  return api<QaReviewItem>("/api/admin/qa/reviews", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchQaReview(
  reviewId: string,
  input: Partial<{
    score: number;
    dimensionScores: Record<string, number>;
    tags: string[];
    note: string;
    status: "draft" | "published";
  }>
) {
  return api<QaReviewItem>(`/api/admin/qa/reviews/${reviewId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listCsatSurveys(input?: {
  status?: "scheduled" | "sent" | "responded" | "expired" | "failed";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  if (input?.page !== undefined) params.set("page", String(input.page));
  if (input?.pageSize !== undefined) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return api<CsatSurveyListResponse>(`/api/admin/csat/surveys${query ? `?${query}` : ""}`);
}

export function patchCsatSurveyStatus(
  surveyId: string,
  status: "scheduled" | "sent" | "responded" | "expired" | "failed"
) {
  return api<{ surveyId: string; status: string }>(`/api/admin/csat/surveys/${surveyId}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function listCsatResponses(input?: {
  agentId?: string;
  minRating?: number;
  maxRating?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.agentId) params.set("agentId", input.agentId);
  if (input?.minRating !== undefined) params.set("minRating", String(input.minRating));
  if (input?.maxRating !== undefined) params.set("maxRating", String(input.maxRating));
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  if (input?.page !== undefined) params.set("page", String(input.page));
  if (input?.pageSize !== undefined) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return api<CsatResponseListResponse>(`/api/admin/csat/responses${query ? `?${query}` : ""}`);
}

export function getSupervisorOverview() {
  return api<SupervisorOverview>("/api/admin/supervisor/overview");
}

export function listSupervisorWaitingConversations(limit = 30) {
  return api<SupervisorWaitingConversation[]>(`/api/admin/supervisor/waiting-conversations?limit=${encodeURIComponent(String(limit))}`);
}

export function listSupervisorConversations(input?: {
  departmentId?: string;
  teamId?: string;
  agentId?: string;
  scope?: "all" | "waiting" | "exception" | "active" | "resolved";
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.departmentId) params.set("departmentId", input.departmentId);
  if (input?.teamId) params.set("teamId", input.teamId);
  if (input?.agentId) params.set("agentId", input.agentId);
  if (input?.scope) params.set("scope", input.scope);
  if (input?.page) params.set("page", String(input.page));
  if (input?.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return api<SupervisorConversationWorkbenchResponse>(`/api/admin/supervisor/conversations${query ? `?${query}` : ""}`);
}

export function listSupervisorAgents() {
  return api<SupervisorAgentStatus[]>("/api/admin/supervisor/agents");
}

export function interveneConversation(conversationId: string, text: string) {
  return api<{ queued: boolean }>(`/api/admin/supervisor/conversations/${conversationId}/intervene`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function transferConversation(conversationId: string, targetAgentId: string) {
  return api<{ success: boolean }>(`/api/admin/supervisor/conversations/${conversationId}/transfer`, {
    method: "POST",
    body: JSON.stringify({ targetAgentId })
  });
}

export function forceCloseConversation(conversationId: string, note?: string) {
  return api<{ success: boolean }>(`/api/admin/supervisor/conversations/${conversationId}/force-close`, {
    method: "POST",
    body: JSON.stringify({ note })
  });
}

export function broadcastToOnlineAgents(text: string) {
  return api<{ success: boolean; recipients: number }>("/api/admin/supervisor/broadcast", {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function listCustomerTags(input?: { active?: boolean }) {
  const params = new URLSearchParams();
  if (typeof input?.active === "boolean") params.set("active", String(input.active));
  const query = params.toString();
  return api<CustomerTagItem[]>(`/api/admin/customers/tags${query ? `?${query}` : ""}`);
}

export function createCustomerTag(input: {
  code: string;
  name: string;
  color?: string;
  description?: string;
  isActive?: boolean;
}) {
  return api<CustomerTagItem>("/api/admin/customers/tags", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchCustomerTag(
  tagId: string,
  input: Partial<{ name: string; color: string; description: string; isActive: boolean }>
) {
  return api<CustomerTagItem>(`/api/admin/customers/tags/${tagId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listCustomerSegments(input?: { active?: boolean }) {
  const params = new URLSearchParams();
  if (typeof input?.active === "boolean") params.set("active", String(input.active));
  const query = params.toString();
  return api<CustomerSegmentItem[]>(`/api/admin/customers/segments${query ? `?${query}` : ""}`);
}

export function createCustomerSegment(input: {
  code: string;
  name: string;
  description?: string;
  rule?: Record<string, unknown>;
  isActive?: boolean;
}) {
  return api<CustomerSegmentItem>("/api/admin/customers/segments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchCustomerSegment(
  segmentId: string,
  input: Partial<{ name: string; description: string; rule: Record<string, unknown>; isActive: boolean }>
) {
  return api<CustomerSegmentItem>(`/api/admin/customers/segments/${segmentId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listCustomers(input?: {
  search?: string;
  tagId?: string;
  segmentId?: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input?.search) params.set("search", input.search);
  if (input?.tagId) params.set("tagId", input.tagId);
  if (input?.segmentId) params.set("segmentId", input.segmentId);
  if (input?.page) params.set("page", String(input.page));
  if (input?.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return api<CustomerListResponse>(`/api/admin/customers${query ? `?${query}` : ""}`);
}

export function assignCustomerTags(customerId: string, input: { tagIds: string[]; source?: "manual" | "rule" | "import"; note?: string }) {
  return api<{ customerId: string; updated: boolean; tags: string[] }>(`/api/admin/customers/${customerId}/tags`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function applySegment(segmentId: string, input?: { applyTagId?: string }) {
  return api<{ segmentId: string; matchedCount: number; appliedTagId?: string }>(`/api/admin/customers/segments/${segmentId}/apply`, {
    method: "POST",
    body: JSON.stringify(input ?? {})
  });
}
