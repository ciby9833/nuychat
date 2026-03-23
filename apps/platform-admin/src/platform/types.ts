export type PlatformSession = {
  accessToken: string;
  refreshToken: string;
  identityId: string;
  email: string;
  role: string;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    identityId: string;
    email: string;
    role: string;
  };
};

export type TenantItem = {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  operatingMode: string;
  licensedSeats: number | null;
  licensedAiSeats: number;
  activeSeatCount: number;
  totalAccountCount: number;
  aiModelAccessMode: "platform_managed" | "tenant_managed";
  aiConfig: {
    source: "platform" | "own";
    provider: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
    model: string;
    hasApiKey: boolean;
    baseUrl: string | null;
  } | null;
  aiQuotaUsed: number;
  plan: {
    code: string;
    name: string;
    maxAgents: number | null;
    aiTokenQuotaMonthly: number | null;
  } | null;
};

export type TenantMembershipItem = {
  membershipId: string;
  identityId: string;
  email: string;
  role: string;
  status: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantDetail = TenantItem & {
  createdAt: string;
  updatedAt: string;
  memberships: TenantMembershipItem[];
};

export type TenantListResponse = {
  page: number;
  limit: number;
  total: number;
  items: TenantItem[];
};

export type IdentityCreateInput = {
  email: string;
  password: string;
  status?: "active" | "inactive";
};

export type MembershipCreateInput = {
  tenantId: string;
  identityId: string;
  role: string;
  isDefault?: boolean;
};

export type PlatformTenantAccountCreateInput = {
  tenantId: string;
  email: string;
  password: string;
  role: string;
  isDefault?: boolean;
  status?: "active" | "inactive";
};

export type PlatformSessionItem = {
  scope: "tenant" | "platform";
  sessionId: string;
  identityId: string;
  tenantId: string | null;
  membershipId: string | null;
  status: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdIp: string | null;
  createdUserAgent: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSessionListResponse = {
  page: number;
  limit: number;
  total: number;
  items: PlatformSessionItem[];
};

export type PlatformSessionListQuery = {
  scope?: "all" | "tenant" | "platform";
  status?: "active" | "revoked" | "expired";
  identityId?: string;
  tenantId?: string;
  page?: number;
  limit?: number;
};

export type PlatformSessionBulkRevokeInput = {
  scope?: "all" | "tenant" | "platform";
  identityId?: string;
  tenantId?: string;
  reason?: string;
};

export type PlatformSessionBulkRevokeResponse = {
  success: boolean;
  scope: "all" | "tenant" | "platform";
  revokedPlatform: number;
  revokedTenant: number;
  total: number;
};

export type PlatformAuditLogItem = {
  auditId: string;
  actorIdentityId: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  status: "success" | "failed";
  payload: Record<string, unknown>;
  requestIp: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type PlatformAuditLogListResponse = {
  page: number;
  limit: number;
  total: number;
  items: PlatformAuditLogItem[];
};

export type PlatformAuditLogListQuery = {
  page?: number;
  limit?: number;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorIdentityId?: string;
  status?: "success" | "failed";
};

export type QuotaStatus = "healthy" | "warning" | "exceeded" | "unlimited";

export type PlatformQuotaItem = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  planCode: string | null;
  planName: string | null;
  quotaUsed: number;
  quotaLimit: number | null;
  aiSeatLimit: number;
  aiSeatUsed: number;
  totalAccounts: number;
  usageRatio: number | null;
  quotaStatus: QuotaStatus;
};

export type PlatformQuotaOverviewResponse = {
  page: number;
  limit: number;
  total: number;
  items: PlatformQuotaItem[];
  summary: {
    totalQuotaUsed: number;
    totalQuotaLimit: number;
    totalAiSeatLimit: number;
    totalAiSeatUsed: number;
    totalAccounts: number;
    exceededTenants: number;
    warningTenants: number;
    unlimitedTenants: number;
  };
};

export type PlatformTenantAIConfig = {
  tenantId: string;
  aiModelAccessMode: "platform_managed" | "tenant_managed";
  config: TenantItem["aiConfig"];
};

export type PlatformTenantAIConfigPatchInput = {
  provider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
  model?: string;
  apiKey?: string;
  baseUrl?: string | null;
};

export type PlatformQuotaOverviewQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuotaStatus;
};

export type BillingInvoiceStatus = "issued" | "partially_paid" | "paid" | "void" | "overdue";

export type PlatformBillingItem = {
  invoiceId: string;
  invoiceNo: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  currency: string;
  amountDue: number;
  seatLicenseAmount: number;
  aiUsageAmount: number;
  amountPaid: number;
  outstanding: number;
  status: BillingInvoiceStatus;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  updatedAt: string;
};

export type PlatformBillingOverviewResponse = {
  page: number;
  limit: number;
  total: number;
  items: PlatformBillingItem[];
  summary: {
    totalDue: number;
    totalPaid: number;
    totalOutstanding: number;
    overdueInvoices: number;
  };
};

export type PlatformBillingOverviewQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: BillingInvoiceStatus;
  tenantId?: string;
};

export type AIUsageStatus = "healthy" | "warning" | "blocked" | "unlimited";

export type PlatformAIUsageItem = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  billableCostUsd: number;
  includedTokens: number;
  monthlyBudgetUsd: number | null;
  softLimitUsd: number | null;
  hardLimitUsd: number | null;
  enforcementMode: "notify" | "throttle" | "block";
  policyIsActive: boolean;
  usageStatus: AIUsageStatus;
  budgetRatio: number | null;
  lastActivityAt: string | null;
};

export type PlatformAIUsageTrendItem = {
  date: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type PlatformAIUsageModelBreakdownItem = {
  provider: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type PlatformAIUsageOverviewResponse = {
  page: number;
  limit: number;
  total: number;
  items: PlatformAIUsageItem[];
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalEstimatedCostUsd: number;
    totalBillableCostUsd: number;
    warningTenants: number;
    blockedTenants: number;
  };
  trend: PlatformAIUsageTrendItem[];
  modelBreakdown: PlatformAIUsageModelBreakdownItem[];
};

export type PlatformAIUsageOverviewQuery = {
  page?: number;
  limit?: number;
  search?: string;
  tenantId?: string;
  provider?: "openai" | "anthropic" | "gemini" | "ollama";
  model?: string;
  status?: AIUsageStatus;
  days?: number;
};

export type TenantAIBudgetPolicyPatchInput = {
  includedTokens?: number;
  monthlyBudgetUsd?: number | null;
  softLimitUsd?: number | null;
  hardLimitUsd?: number | null;
  enforcementMode?: "notify" | "throttle" | "block";
  isActive?: boolean;
};

export type BillingCloseCycleInput = {
  periodStart: string;
  periodEnd: string;
  dueDays?: number;
  currency?: string;
  tenantId?: string;
};

export type BillingCloseCycleResponse = {
  success: boolean;
  periodStart: string;
  periodEnd: string;
  dueDays: number;
  currency: string;
  tenantId: string | null;
  generated: number;
  skipped: number;
};

export type BillingPaymentReconcileInput = {
  amount: number;
  method?: string;
  referenceNo?: string;
  note?: string;
  receivedAt?: string;
};

export type BillingStatementExportOptions = {
  lang?: "en" | "zh-CN" | "id";
  includeTax?: boolean;
  taxRate?: number;
  brandName?: string;
  companyName?: string;
  companyAddress?: string;
  supportEmail?: string;
  website?: string;
  taxId?: string;
};

export type MarketplaceTier = "official" | "private" | "third_party";
export type MarketplaceSkillStatus = "draft" | "published" | "deprecated";

export type MarketplaceSkillItem = {
  skillId: string;
  slug: string;
  name: string;
  description: string;
  tier: MarketplaceTier;
  ownerTenantId: string | null;
  ownerTenantSlug: string | null;
  providerIdentityId: string | null;
  providerEmail: string | null;
  status: MarketplaceSkillStatus;
  latestVersion: string;
  manifest: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceSkillListResponse = {
  page: number;
  limit: number;
  total: number;
  items: MarketplaceSkillItem[];
};

export type MarketplaceSkillCreateInput = {
  slug: string;
  name: string;
  description: string;
  tier: MarketplaceTier;
  ownerTenantId?: string;
  providerIdentityId?: string;
  status?: MarketplaceSkillStatus;
  version?: string;
  changelog?: string;
  manifest?: Record<string, unknown>;
};

export type MarketplaceInstallItem = {
  installId: string;
  tenantId: string;
  tenantSlug: string;
  skillId: string;
  skillSlug: string;
  skillName: string;
  tier: MarketplaceTier;
  releaseId: string;
  version: string;
  status: "active" | "disabled";
  installedByIdentityId: string | null;
  installedByEmail: string | null;
  installedAt: string;
  updatedAt: string;
};

export type MarketplaceInstallListResponse = {
  page: number;
  limit: number;
  total: number;
  items: MarketplaceInstallItem[];
};

export type MarketplaceInstallPatchInput = {
  status?: "active" | "disabled";
  releaseId?: string;
};
