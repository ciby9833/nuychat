import { readSession } from "./session";
import type {
  BillingCloseCycleInput,
  BillingCloseCycleResponse,
  BillingPaymentReconcileInput,
  BillingStatementExportOptions,
  IdentityCreateInput,
  MarketplaceInstallListResponse,
  MarketplaceSkillCreateInput,
  MarketplaceSkillListResponse,
  LoginResponse,
  MembershipCreateInput,
  PlatformBillingOverviewQuery,
  PlatformBillingOverviewResponse,
  PlatformAuditLogListQuery,
  PlatformAuditLogListResponse,
  PlatformAIUsageOverviewQuery,
  PlatformAIUsageOverviewResponse,
  PlatformQuotaOverviewQuery,
  PlatformQuotaOverviewResponse,
  PlatformSessionBulkRevokeInput,
  PlatformSessionBulkRevokeResponse,
  PlatformSessionListResponse,
  PlatformSessionListQuery,
  PlatformSession,
  PlatformTenantAccountCreateInput,
  PlatformTenantAIConfig,
  PlatformTenantAIConfigPatchInput,
  TenantAIBudgetPolicyPatchInput,
  TenantDetail,
  TenantListResponse
} from "./types";

const API_BASE = readRequiredEnv("VITE_API_BASE_URL");
const SESSION_KEY = "nuychat.platformSession";

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
let _sessionUpdater: ((s: PlatformSession) => void) | null = null;

export function registerPlatformSessionUpdater(fn: (s: PlatformSession) => void): void {
  _sessionUpdater = fn;
}

export function unregisterPlatformSessionUpdater(): void {
  _sessionUpdater = null;
}

// ─── Silent refresh ────────────────────────────────────────────────────────────
// Deduplicated: concurrent 401s share one in-flight refresh promise.
let _refreshInFlight: Promise<PlatformSession | null> | null = null;

function goToLogin(): void {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "/";
}

async function tryRefresh(session: PlatformSession): Promise<PlatformSession | null> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/platform/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken })
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      const next: PlatformSession = { ...session, accessToken: data.accessToken, refreshToken: data.refreshToken };
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

// ─── Core http helper ─────────────────────────────────────────────────────────
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const current = readSession();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined)
  };
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
  if (init?.body !== undefined && !hasContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (current?.accessToken) {
    headers.Authorization = `Bearer ${current.accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // On 401: attempt silent token refresh once, then retry
  if (res.status === 401 && current) {
    const next = await tryRefresh(current);
    if (next) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${next.accessToken}` };
      res = await fetch(`${API_BASE}${path}`, { ...init, headers: retryHeaders });
    } else {
      goToLogin();
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      if (data.message) {
        message = data.message;
      } else if (data.error) {
        message = data.error;
      }
    } catch {
      // Ignore invalid/non-JSON error payloads and fall back to status text.
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function platformLogin(email: string, password: string) {
  return http<LoginResponse>("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function platformLogout() {
  return http<{ success: boolean }>("/api/platform/auth/logout", {
    method: "POST",
    body: JSON.stringify({ allSessions: false })
  });
}

export function listTenants() {
  return http<TenantListResponse>("/api/platform/tenants?page=1&limit=50");
}

export function createTenant(input: {
  name: string;
  slug: string;
  planCode: string;
  operatingMode: string;
  licensedSeats?: number;
  licensedAiSeats?: number;
  aiModelAccessMode: "platform_managed" | "tenant_managed";
  aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
  aiModel?: string;
  aiApiKey?: string;
  aiBaseUrl?: string | null;
}) {
  return http("/api/platform/tenants", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchTenant(
  tenantId: string,
  input: {
    name?: string;
    slug?: string;
    status?: string;
    planCode?: string;
    operatingMode?: string;
    licensedSeats?: number | null;
    licensedAiSeats?: number | null;
    aiModelAccessMode?: "platform_managed" | "tenant_managed";
    aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
    aiModel?: string;
    aiApiKey?: string;
    aiBaseUrl?: string | null;
  }
) {
  return http(`/api/platform/tenants/${tenantId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function createIdentity(input: IdentityCreateInput) {
  return http<{ identityId: string; email: string; status: string }>("/api/platform/identities", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createTenantAccount(input: PlatformTenantAccountCreateInput) {
  return http<{
    identityId: string;
    email: string;
    identityStatus: string;
    membershipId: string;
    tenantId: string;
    role: string;
    membershipStatus: string;
    isDefault: boolean;
  }>("/api/platform/tenant-accounts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createMembership(input: MembershipCreateInput) {
  return http<{ membershipId: string; tenantId: string; identityId: string; role: string; status: string; isDefault: boolean }>(
    "/api/platform/memberships",
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function getTenantDetail(tenantId: string) {
  return http<TenantDetail>(`/api/platform/tenants/${tenantId}`);
}

export function getTenantAIConfig(tenantId: string) {
  return http<PlatformTenantAIConfig>(`/api/platform/tenants/${tenantId}/ai-config`);
}

export function patchTenantAIConfig(tenantId: string, input: PlatformTenantAIConfigPatchInput) {
  return http<PlatformTenantAIConfig>(`/api/platform/tenants/${tenantId}/ai-config`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function patchMembership(
  membershipId: string,
  input: { role?: string; status?: "active" | "inactive"; isDefault?: boolean }
) {
  return http<{
    membershipId: string;
    tenantId: string;
    identityId: string;
    role: string;
    status: string;
    isDefault: boolean;
    updatedAt: string;
  }>(`/api/platform/memberships/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listPlatformSessions(input?: PlatformSessionListQuery) {
  const params = new URLSearchParams();
  params.set("page", String(input?.page ?? 1));
  params.set("limit", String(input?.limit ?? 100));
  if (input?.scope) params.set("scope", input.scope);
  if (input?.status) params.set("status", input.status);
  if (input?.identityId) params.set("identityId", input.identityId);
  if (input?.tenantId) params.set("tenantId", input.tenantId);
  return http<PlatformSessionListResponse>(`/api/platform/sessions?${params.toString()}`);
}

export function revokePlatformSession(scope: "tenant" | "platform", sessionId: string) {
  return http<{ success: boolean }>(`/api/platform/sessions/${scope}/${sessionId}/revoke`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function revokePlatformSessionsBulk(input: PlatformSessionBulkRevokeInput) {
  return http<PlatformSessionBulkRevokeResponse>("/api/platform/sessions/revoke-all", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listPlatformAuditLogs(input?: PlatformAuditLogListQuery) {
  const params = new URLSearchParams();
  params.set("page", String(input?.page ?? 1));
  params.set("limit", String(input?.limit ?? 20));
  if (input?.action) params.set("action", input.action);
  if (input?.targetType) params.set("targetType", input.targetType);
  if (input?.targetId) params.set("targetId", input.targetId);
  if (input?.actorIdentityId) params.set("actorIdentityId", input.actorIdentityId);
  if (input?.status) params.set("status", input.status);
  return http<PlatformAuditLogListResponse>(`/api/platform/audit-logs?${params.toString()}`);
}

export function getPlatformQuotaOverview(input?: PlatformQuotaOverviewQuery) {
  const params = new URLSearchParams();
  params.set("page", String(input?.page ?? 1));
  params.set("limit", String(input?.limit ?? 20));
  if (input?.search) params.set("search", input.search);
  if (input?.status) params.set("status", input.status);
  return http<PlatformQuotaOverviewResponse>(`/api/platform/quotas/overview?${params.toString()}`);
}

export function getPlatformBillingOverview(input?: PlatformBillingOverviewQuery) {
  const params = new URLSearchParams();
  params.set("page", String(input?.page ?? 1));
  params.set("limit", String(input?.limit ?? 20));
  if (input?.search) params.set("search", input.search);
  if (input?.status) params.set("status", input.status);
  if (input?.tenantId) params.set("tenantId", input.tenantId);
  return http<PlatformBillingOverviewResponse>(`/api/platform/billing/overview?${params.toString()}`);
}

export function getPlatformAIUsageOverview(input?: PlatformAIUsageOverviewQuery) {
  const params = new URLSearchParams();
  params.set("page", String(input?.page ?? 1));
  params.set("limit", String(input?.limit ?? 20));
  if (input?.search) params.set("search", input.search);
  if (input?.tenantId) params.set("tenantId", input.tenantId);
  if (input?.provider) params.set("provider", input.provider);
  if (input?.model) params.set("model", input.model);
  if (input?.status) params.set("status", input.status);
  if (input?.days !== undefined) params.set("days", String(input.days));
  return http<PlatformAIUsageOverviewResponse>(`/api/platform/ai-usage/overview?${params.toString()}`);
}

export function patchTenantAIBudgetPolicy(tenantId: string, input: TenantAIBudgetPolicyPatchInput) {
  return http<{
    tenantId: string;
    includedTokens: number;
    monthlyBudgetUsd: number | null;
    softLimitUsd: number | null;
    hardLimitUsd: number | null;
    enforcementMode: "notify" | "throttle" | "block";
    isActive: boolean;
    updatedAt: string;
  }>(`/api/platform/ai-usage/budgets/${tenantId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function closeBillingCycle(input: BillingCloseCycleInput) {
  return http<BillingCloseCycleResponse>("/api/platform/billing/cycles/close", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function reconcileBillingPayment(invoiceId: string, input: BillingPaymentReconcileInput) {
  return http<{
    success: boolean;
    paymentId: string;
    invoiceId: string;
    amountDue: number;
    amountPaid: number;
    outstanding: number;
    status: string;
  }>(`/api/platform/billing/invoices/${invoiceId}/payments/reconcile`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function exportBillingStatement(invoiceId: string, format: "csv" | "pdf", options?: BillingStatementExportOptions) {
  const current = readSession();
  const headers: Record<string, string> = {};
  if (current?.accessToken) {
    headers.Authorization = `Bearer ${current.accessToken}`;
  }

  const params = new URLSearchParams();
  if (options?.lang) params.set("lang", options.lang);
  if (options?.includeTax !== undefined) params.set("includeTax", String(options.includeTax));
  if (options?.taxRate !== undefined) params.set("taxRate", String(options.taxRate));
  if (options?.brandName) params.set("brandName", options.brandName);
  if (options?.companyName) params.set("companyName", options.companyName);
  if (options?.companyAddress) params.set("companyAddress", options.companyAddress);
  if (options?.supportEmail) params.set("supportEmail", options.supportEmail);
  if (options?.website) params.set("website", options.website);
  if (options?.taxId) params.set("taxId", options.taxId);

  const query = params.toString();
  const requestUrl = `${API_BASE}/api/platform/billing/invoices/${invoiceId}/statement.${format}${query ? `?${query}` : ""}`;

  const res = await fetch(requestUrl, {
    method: "GET",
    headers
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const blob = await res.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `invoice-statement-${invoiceId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(downloadUrl);
}

export function listMarketplaceSkills(input?: {
  page?: number;
  limit?: number;
  tier?: "official" | "private" | "third_party";
  status?: "draft" | "published" | "deprecated";
  search?: string;
  ownerTenantId?: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(input?.page ?? 1));
  params.set("limit", String(input?.limit ?? 50));
  if (input?.tier) params.set("tier", input.tier);
  if (input?.status) params.set("status", input.status);
  if (input?.search) params.set("search", input.search);
  if (input?.ownerTenantId) params.set("ownerTenantId", input.ownerTenantId);
  return http<MarketplaceSkillListResponse>(`/api/platform/marketplace/skills?${params.toString()}`);
}

export function createMarketplaceSkill(input: MarketplaceSkillCreateInput) {
  return http<{ skillId: string }>(`/api/platform/marketplace/skills`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchMarketplaceSkill(
  skillId: string,
  input: { name?: string; description?: string; status?: "draft" | "published" | "deprecated"; manifest?: Record<string, unknown> }
) {
  return http<{ skillId: string }>(`/api/platform/marketplace/skills/${skillId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function disableMarketplaceSkill(skillId: string) {
  return http<{ success: boolean }>(`/api/platform/marketplace/skills/${skillId}/disable`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function retractMarketplaceSkill(skillId: string) {
  return http<{ success: boolean }>(`/api/platform/marketplace/skills/${skillId}/retract`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function deleteMarketplaceSkill(skillId: string) {
  return http<{ success: boolean }>(`/api/platform/marketplace/skills/${skillId}`, {
    method: "DELETE"
  });
}

export function publishMarketplaceSkill(skillId: string, input: { version: string; changelog?: string; manifest?: Record<string, unknown> }) {
  return http<{ success: boolean; releaseId: string; version: string }>(`/api/platform/marketplace/skills/${skillId}/publish`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listMarketplaceInstalls(input?: { page?: number; limit?: number; tenantId?: string; skillId?: string; status?: "active" | "disabled" }) {
  const params = new URLSearchParams();
  params.set("page", String(input?.page ?? 1));
  params.set("limit", String(input?.limit ?? 50));
  if (input?.tenantId) params.set("tenantId", input.tenantId);
  if (input?.skillId) params.set("skillId", input.skillId);
  if (input?.status) params.set("status", input.status);
  return http<MarketplaceInstallListResponse>(`/api/platform/marketplace/installs?${params.toString()}`);
}
