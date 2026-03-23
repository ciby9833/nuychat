import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import {
  closeBillingCycle,
  deleteMarketplaceSkill,
  disableMarketplaceSkill,
  createMarketplaceSkill,
  createTenantAccount,
  createTenant,
  exportBillingStatement,
  getPlatformAIUsageOverview,
  getTenantAIConfig,
  getTenantDetail,
  getPlatformBillingOverview,
  listMarketplaceInstalls,
  listMarketplaceSkills,
  patchMembership,
  patchMarketplaceSkill,
  patchTenantAIBudgetPolicy,
  getPlatformQuotaOverview,
  listPlatformAuditLogs,
  listPlatformSessions,
  listTenants,
  patchTenant,
  patchTenantAIConfig,
  platformLogout,
  publishMarketplaceSkill,
  reconcileBillingPayment,
  retractMarketplaceSkill,
  revokePlatformSession,
  revokePlatformSessionsBulk,
  registerPlatformSessionUpdater,
  unregisterPlatformSessionUpdater
} from "../api";
import { PlatformShell } from "../layout/PlatformShell";
import { clearSession, readSession } from "../session";
import type {
  BillingStatementExportOptions,
  BillingInvoiceStatus,
  MarketplaceInstallItem,
  MarketplaceSkillItem,
  PlatformAuditLogItem,
  PlatformAIUsageOverviewResponse,
  PlatformBillingOverviewResponse,
  PlatformQuotaOverviewResponse,
  PlatformSessionItem,
  TenantDetail,
  TenantItem
} from "../types";
import { AuditSection } from "./modules/AuditSection";
import { AIUsageSection } from "./modules/AIUsageSection";
import { BillingSection } from "./modules/BillingSection";
import { OverviewSection } from "./modules/OverviewSection";
import { QuotasSection } from "./modules/QuotasSection";
import { SessionsSection } from "./modules/SessionsSection";
import { TenantsSection } from "./modules/TenantsSection";
import { MarketplaceSection } from "./modules/MarketplaceSection";

function sectionFromPath(pathname: string) {
  const value = pathname.split("/")[2] || "overview";
  if (["overview", "tenants", "marketplace", "sessions", "quotas", "ai-usage", "billing", "audit"].includes(value)) return value;
  return "overview";
}

const SECTION_TITLE: Record<string, string> = {
  overview: "Overview",
  tenants: "Tenant Management",
  marketplace: "Skill Marketplace",
  sessions: "Session Governance",
  quotas: "Seat Licensing",
  "ai-usage": "AI Usage",
  billing: "Billing Settlement",
  audit: "Audit Logs"
};

export function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(() => readSession());
  const currentSection = sectionFromPath(location.pathname);

  const [items, setItems] = useState<TenantItem[]>([]);
  const [total, setTotal] = useState(0);
  const [marketplaceSkills, setMarketplaceSkills] = useState<MarketplaceSkillItem[]>([]);
  const [marketplaceInstalls, setMarketplaceInstalls] = useState<MarketplaceInstallItem[]>([]);
  const [sessions, setSessions] = useState<PlatformSessionItem[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionFilters, setSessionFilters] = useState({
    scope: "all" as "all" | "tenant" | "platform",
    status: "active" as "active" | "revoked" | "expired",
    identityId: "",
    tenantId: ""
  });
  const [auditLogs, setAuditLogs] = useState<PlatformAuditLogItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [quotaFilters, setQuotaFilters] = useState({
    search: "",
    status: "all" as "all" | "healthy" | "warning" | "exceeded" | "unlimited"
  });
  const [quotaOverview, setQuotaOverview] = useState<PlatformQuotaOverviewResponse | null>(null);
  const [aiUsageFilters, setAIUsageFilters] = useState({
    search: "",
    status: "all" as "all" | "healthy" | "warning" | "blocked" | "unlimited",
    days: 30
  });
  const [aiUsageOverview, setAIUsageOverview] = useState<PlatformAIUsageOverviewResponse | null>(null);
  const [billingFilters, setBillingFilters] = useState({
    search: "",
    status: "all" as "all" | BillingInvoiceStatus
  });
  const [billingOverview, setBillingOverview] = useState<PlatformBillingOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTenants = useCallback(async () => {
    const data = await listTenants();
    setItems(data.items);
    setTotal(data.total);
  }, []);

  const loadSessions = useCallback(async () => {
    const ss = await listPlatformSessions({
      scope: sessionFilters.scope,
      status: sessionFilters.status,
      identityId: sessionFilters.identityId || undefined,
      tenantId: sessionFilters.tenantId || undefined,
      page: 1,
      limit: 100
    });
    setSessions(ss.items);
    setSessionTotal(ss.total);
  }, [sessionFilters.identityId, sessionFilters.scope, sessionFilters.status, sessionFilters.tenantId]);

  const loadMarketplace = useCallback(async () => {
    const [skills, installs] = await Promise.all([
      listMarketplaceSkills({ page: 1, limit: 100 }),
      listMarketplaceInstalls({ page: 1, limit: 100 })
    ]);
    setMarketplaceSkills(skills.items);
    setMarketplaceInstalls(installs.items);
  }, []);

  const loadAuditLogs = useCallback(async () => {
    const logs = await listPlatformAuditLogs({ page: 1, limit: 20 });
    setAuditLogs(logs.items);
    setAuditTotal(logs.total);
  }, []);

  const loadQuotaOverview = useCallback(async () => {
    const data = await getPlatformQuotaOverview({
      page: 1,
      limit: 20,
      search: quotaFilters.search || undefined,
      status: quotaFilters.status === "all" ? undefined : quotaFilters.status
    });
    setQuotaOverview(data);
  }, [quotaFilters.search, quotaFilters.status]);

  const loadBillingOverview = useCallback(async () => {
    const data = await getPlatformBillingOverview({
      page: 1,
      limit: 20,
      search: billingFilters.search || undefined,
      status: billingFilters.status === "all" ? undefined : billingFilters.status
    });
    setBillingOverview(data);
  }, [billingFilters.search, billingFilters.status]);

  const loadAIUsageOverview = useCallback(async () => {
    const data = await getPlatformAIUsageOverview({
      page: 1,
      limit: 20,
      search: aiUsageFilters.search || undefined,
      status: aiUsageFilters.status === "all" ? undefined : aiUsageFilters.status,
      days: aiUsageFilters.days
    });
    setAIUsageOverview(data);
  }, [aiUsageFilters.days, aiUsageFilters.search, aiUsageFilters.status]);

  // ── Register silent-refresh callback so api.ts can update session state ──────
  useEffect(() => {
    registerPlatformSessionUpdater((next) => setSession(next));
    return () => unregisterPlatformSessionUpdater();
  }, []);

  // ── Auto-redirect to login when session is lost ────────────────────────────
  useEffect(() => {
    if (!session) {
      clearSession();
      navigate("/", { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (!session?.accessToken) return;
    setError("");
    setLoading(true);

    const tasks: Array<Promise<unknown>> = [];
    if (currentSection === "overview" || currentSection === "tenants" || currentSection === "marketplace") tasks.push(loadTenants());
    if (currentSection === "overview" || currentSection === "marketplace") tasks.push(loadMarketplace());
    if (currentSection === "overview" || currentSection === "sessions") tasks.push(loadSessions());
    if (currentSection === "overview" || currentSection === "audit") tasks.push(loadAuditLogs());
    if (currentSection === "overview" || currentSection === "quotas") tasks.push(loadQuotaOverview());
    if (currentSection === "overview" || currentSection === "ai-usage") tasks.push(loadAIUsageOverview());
    if (currentSection === "overview" || currentSection === "billing") tasks.push(loadBillingOverview());

    Promise.all(tasks)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [
    currentSection,
    loadAuditLogs,
    loadBillingOverview,
    loadMarketplace,
    loadAIUsageOverview,
    loadQuotaOverview,
    loadSessions,
    loadTenants,
    session?.accessToken
  ]);

  // Render nothing while redirect fires
  if (!session) return null;

  const onCreateTenant = async (input: {
    name: string;
    slug: string;
    planCode: string;
    operatingMode: string;
    licensedSeats?: number;
    licensedAiSeats?: number;
    aiModelAccessMode: "platform_managed" | "tenant_managed";
    aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
    aiModel?: string;
  }) => {
    setError("");
    setNotice("");
    try {
      await createTenant(input);
      setNotice("Tenant created");
      await loadTenants();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onRevokeSession = async (scope: "tenant" | "platform", sessionId: string) => {
    setError("");
    setNotice("");
    try {
      await revokePlatformSession(scope, sessionId);
      setNotice(`Session revoked: ${scope}:${sessionId.slice(0, 8)}...`);
      await Promise.all([loadSessions(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onBulkRevokeSessions = async () => {
    setError("");
    setNotice("");
    try {
      const res = await revokePlatformSessionsBulk({
        scope: sessionFilters.scope,
        identityId: sessionFilters.identityId || undefined,
        tenantId: sessionFilters.tenantId || undefined,
        reason: "platform_bulk_revoke"
      });
      setNotice(`Bulk revoke completed: ${res.total} sessions`);
      await Promise.all([loadSessions(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onToggleStatus = async (item: TenantItem) => {
    const nextStatus = item.status === "active" ? "suspended" : "active";
    setError("");
    setNotice("");
    try {
      await patchTenant(item.tenantId, { status: nextStatus });
      setNotice(`Tenant ${item.slug} -> ${nextStatus}`);
      await loadTenants();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUpdateTenant = async (
    tenantId: string,
    input: {
      name?: string;
      slug?: string;
      status?: "active" | "suspended" | "inactive";
      planCode?: string;
      operatingMode?: string;
      licensedSeats?: number | null;
      licensedAiSeats?: number | null;
      aiModelAccessMode?: "platform_managed" | "tenant_managed";
      aiProvider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
      aiModel?: string;
    }
  ) => {
    setError("");
    setNotice("");
    try {
      await patchTenant(tenantId, input);
      setNotice("Tenant updated");
      await Promise.all([loadTenants(), loadQuotaOverview()]);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const onUpdateTenantAIConfig = async (
    tenantId: string,
    input: {
      provider?: "openai" | "claude" | "gemini" | "deepseek" | "llama" | "kimi" | "qwen" | "private";
      model?: string;
      apiKey?: string;
      baseUrl?: string | null;
    }
  ) => {
    setError("");
    setNotice("");
    try {
      await patchTenantAIConfig(tenantId, input);
      setNotice("Tenant AI model config updated");
      await Promise.all([loadTenants(), loadAIUsageOverview()]);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const onCreateMarketplaceSkill = async (input: {
    slug: string;
    name: string;
    description: string;
    tier: "official" | "private" | "third_party";
    ownerTenantId?: string;
    version: string;
    changelog: string;
    manifest: Record<string, unknown>;
  }) => {
    setError("");
    setNotice("");
    try {
      await createMarketplaceSkill(input);
      setNotice(`Marketplace skill created: ${input.slug}`);
      await loadMarketplace();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onPublishMarketplaceSkill = async (skillId: string, input: { version: string; changelog: string }) => {
    setError("");
    setNotice("");
    try {
      await publishMarketplaceSkill(skillId, input);
      setNotice(`Skill published: ${skillId.slice(0, 8)}... v${input.version}`);
      await Promise.all([loadMarketplace(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUpdateMarketplaceSkill = async (
    skillId: string,
    input: { name?: string; description?: string; status?: "draft" | "published" | "deprecated" }
  ) => {
    setError("");
    setNotice("");
    try {
      await patchMarketplaceSkill(skillId, input);
      setNotice(`Skill updated: ${skillId.slice(0, 8)}...`);
      await Promise.all([loadMarketplace(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDisableMarketplaceSkill = async (skillId: string) => {
    setError("");
    setNotice("");
    try {
      await disableMarketplaceSkill(skillId);
      setNotice(`Skill disabled: ${skillId.slice(0, 8)}...`);
      await Promise.all([loadMarketplace(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onRetractMarketplaceSkill = async (skillId: string) => {
    setError("");
    setNotice("");
    try {
      await retractMarketplaceSkill(skillId);
      setNotice(`Skill retracted to draft: ${skillId.slice(0, 8)}...`);
      await Promise.all([loadMarketplace(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDeleteMarketplaceSkill = async (skillId: string) => {
    setError("");
    setNotice("");
    try {
      await deleteMarketplaceSkill(skillId);
      setNotice(`Skill deleted: ${skillId.slice(0, 8)}...`);
      await Promise.all([loadMarketplace(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCreateTenantAccount = async (input: {
    email: string;
    password: string;
    tenantId: string;
    role: string;
    isDefault: boolean;
  }) => {
    setError("");
    setNotice("");
    try {
      await createTenantAccount({
        tenantId: input.tenantId,
        email: input.email,
        password: input.password,
        role: input.role,
        isDefault: input.isDefault,
        status: "active"
      });
      setNotice(`Account created: ${input.email}`);
      await loadTenants();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const onLoadTenantDetail = async (tenantId: string): Promise<TenantDetail> => {
    setError("");
    return getTenantDetail(tenantId);
  };

  const onUpdateTenantMembership = async (
    membershipId: string,
    input: { role?: string; status?: "active" | "inactive"; isDefault?: boolean }
  ) => {
    setError("");
    setNotice("");
    try {
      await patchMembership(membershipId, input);
      setNotice("Account updated");
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const onCloseBillingCycle = async (input: {
    periodStart: string;
    periodEnd: string;
    dueDays: number;
    currency: string;
    tenantId?: string;
  }) => {
    setError("");
    setNotice("");
    try {
      const res = await closeBillingCycle(input);
      setNotice(`Billing cycle closed: generated ${res.generated}, skipped ${res.skipped}`);
      await Promise.all([loadBillingOverview(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUpdateTenantAIBudget = async (
    tenantId: string,
    input: {
      includedTokens?: number;
      monthlyBudgetUsd?: number | null;
      softLimitUsd?: number | null;
      hardLimitUsd?: number | null;
      enforcementMode?: "notify" | "throttle" | "block";
      isActive?: boolean;
    }
  ) => {
    setError("");
    setNotice("");
    try {
      await patchTenantAIBudgetPolicy(tenantId, input);
      setNotice("AI budget policy updated");
      await loadAIUsageOverview();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const onReconcileInvoice = async (invoiceId: string, input: { amount: number; method?: string; note?: string }) => {
    setError("");
    setNotice("");
    try {
      await reconcileBillingPayment(invoiceId, input);
      setNotice(`Invoice reconciled: ${invoiceId.slice(0, 8)}...`);
      await Promise.all([loadBillingOverview(), loadAuditLogs()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onExportInvoiceStatement = async (
    invoiceId: string,
    format: "csv" | "pdf",
    options: BillingStatementExportOptions
  ) => {
    setError("");
    try {
      await exportBillingStatement(invoiceId, format, options);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onLogout = async () => {
    try {
      await platformLogout();
    } finally {
      clearSession();
      navigate("/");
    }
  };

  return (
    <PlatformShell
      email={session.email}
      title={SECTION_TITLE[currentSection] ?? "Platform Admin"}
      subtitle={notice || (error ? `Error: ${error}` : undefined)}
      onLogout={onLogout}
    >
      <Routes>
        <Route index element={<Navigate to="/dashboard/overview" replace />} />
        <Route
          path="overview"
          element={
            <OverviewSection
              totalTenants={total}
              sessionTotal={sessionTotal}
              auditTotal={auditTotal}
              loading={loading}
              error={error}
              notice={notice}
            />
          }
        />
        <Route
          path="tenants"
          element={
            <TenantsSection
              items={items}
              loading={loading}
              error={error}
              notice={notice}
              onCreateTenant={onCreateTenant}
              onCreateTenantAccount={onCreateTenantAccount}
              onLoadTenantDetail={onLoadTenantDetail}
              onToggleStatus={onToggleStatus}
              onUpdateTenantMembership={onUpdateTenantMembership}
              onUpdateTenant={onUpdateTenant}
              onLoadTenantAIConfig={getTenantAIConfig}
              onUpdateTenantAIConfig={onUpdateTenantAIConfig}
            />
          }
        />
        <Route
          path="marketplace"
          element={
            <MarketplaceSection
              skills={marketplaceSkills}
              installs={marketplaceInstalls}
              tenants={items}
              onCreate={onCreateMarketplaceSkill}
              onUpdate={onUpdateMarketplaceSkill}
              onPublish={onPublishMarketplaceSkill}
              onDisable={onDisableMarketplaceSkill}
              onRetract={onRetractMarketplaceSkill}
              onDelete={onDeleteMarketplaceSkill}
            />
          }
        />
        <Route
          path="sessions"
          element={
            <SessionsSection
              items={sessions}
              total={sessionTotal}
              filters={sessionFilters}
              onFilterChange={setSessionFilters}
              onBulkRevoke={onBulkRevokeSessions}
              onRevoke={onRevokeSession}
            />
          }
        />
        <Route
          path="quotas"
          element={<QuotasSection data={quotaOverview} filters={quotaFilters} onFilterChange={setQuotaFilters} onUpdateTenant={onUpdateTenant} />}
        />
        <Route
          path="ai-usage"
          element={
            <AIUsageSection
              data={aiUsageOverview}
              filters={aiUsageFilters}
              onFilterChange={setAIUsageFilters}
              onUpdateBudget={onUpdateTenantAIBudget}
            />
          }
        />
        <Route
          path="billing"
          element={
            <BillingSection
              data={billingOverview}
              filters={billingFilters}
              onFilterChange={setBillingFilters}
              onCloseCycle={onCloseBillingCycle}
              onReconcile={onReconcileInvoice}
              onExport={onExportInvoiceStatement}
            />
          }
        />
        <Route path="audit" element={<AuditSection items={auditLogs} total={auditTotal} />} />
        <Route path="*" element={<Navigate to="/dashboard/overview" replace />} />
      </Routes>
    </PlatformShell>
  );
}
