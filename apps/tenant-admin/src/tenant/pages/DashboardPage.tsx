import {
  ApartmentOutlined,
  AppstoreOutlined,
  AreaChartOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ForkOutlined,
  GlobalOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  ReadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SmileOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { Button, Dropdown, Layout, Menu, Select, Space, Spin, Tabs, Typography } from "antd";
import type { MenuProps } from "antd";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { logoutTenant, registerTenantSessionUpdater, switchTenant, unregisterTenantSessionUpdater } from "../api";
import { changeLanguage, LANGS } from "../../i18n";
import { clearTenantSession, readTenantSession, writeTenantSession } from "../session";
import { useTenantTabStore } from "../stores/tabStore";
import type { AdminSession, MembershipSummary, Tab } from "../types";

type AdminNavigateDetail = {
  tab: Tab;
};

const { Header, Sider, Content } = Layout;

// ── lazy-load each tab ────────────────────────────────────────────────────────
const OverviewTab        = lazy(() => import("../components/tabs/OverviewTab").then(m => ({ default: m.OverviewTab })));
const CasesTab           = lazy(() => import("../components/tabs/CasesTab").then(m => ({ default: m.CasesTab })));
const HumanConversationsTab = lazy(() => import("../components/tabs/HumanConversationsTab").then(m => ({ default: m.HumanConversationsTab })));
const TasksTab           = lazy(() => import("../components/tabs/TasksTab").then(m => ({ default: m.TasksTab })));
const OrganizationTab    = lazy(() => import("../components/tabs/OrganizationTab").then(m => ({ default: m.OrganizationTab })));
const PermissionsTab     = lazy(() => import("../components/tabs/PermissionsTab").then(m => ({ default: m.PermissionsTab })));
const ShiftsTab          = lazy(() => import("../components/tabs/ShiftsTab").then(m => ({ default: m.ShiftsTab })));
const AgentsTab          = lazy(() => import("../components/tabs/AgentsTab").then(m => ({ default: m.AgentsTab })));
const AISeatsTab         = lazy(() => import("../components/tabs/AISeatsTab").then(m => ({ default: m.AISeatsTab })));
const AIConversationsTab = lazy(() => import("../components/tabs/AIConversationsTab").then(m => ({ default: m.AIConversationsTab })));
const MemoryQaTab        = lazy(() => import("../components/tabs/MemoryQaTab").then(m => ({ default: m.MemoryQaTab })));
const DispatchAuditTab   = lazy(() => import("../components/tabs/DispatchAuditTab").then(m => ({ default: m.DispatchAuditTab })));
const AIConfigTab        = lazy(() => import("../components/tabs/AIConfigTab").then(m => ({ default: m.AIConfigTab })));
const CapabilitiesTab    = lazy(() => import("../components/tabs/CapabilitiesTab").then(m => ({ default: m.CapabilitiesTab })));
const KnowledgeBaseTab   = lazy(() => import("../components/tabs/KnowledgeBaseTab").then(m => ({ default: m.KnowledgeBaseTab })));
const RoutingTab         = lazy(() => import("../components/tabs/RoutingTab").then(m => ({ default: m.RoutingTab })));
const ChannelsTab        = lazy(() => import("../components/tabs/ChannelsTab").then(m => ({ default: m.ChannelsTab })));
const AnalyticsTab       = lazy(() => import("../components/tabs/AnalyticsTab").then(m => ({ default: m.AnalyticsTab })));
const WaMonitorTab       = lazy(() => import("../components/tabs/WaMonitorTab").then(m => ({ default: m.WaMonitorTab })));
const WaConversationsTab = lazy(() => import("../components/tabs/WaConversationsTab").then(m => ({ default: m.WaConversationsTab })));
const SlaTab             = lazy(() => import("../components/tabs/SlaTab").then(m => ({ default: m.SlaTab })));
const QaTab              = lazy(() => import("../components/tabs/QaTab").then(m => ({ default: m.QaTab })));
const CsatTab            = lazy(() => import("../components/tabs/CsatTab").then(m => ({ default: m.CsatTab })));
const SupervisorTab      = lazy(() => import("../components/tabs/SupervisorTab").then(m => ({ default: m.SupervisorTab })));
const CustomersTab       = lazy(() => import("../components/tabs/CustomersTab").then(m => ({ default: m.CustomersTab })));

// TypeScript enforces exhaustive coverage
const TAB_COMPONENTS: Record<Tab, ComponentType> = {
  overview:              OverviewTab,
  cases:                 CasesTab,
  "human-conversations": HumanConversationsTab,
  tasks:                 TasksTab,
  organization:          OrganizationTab,
  permissions:           PermissionsTab,
  shifts:                ShiftsTab,
  agents:                AgentsTab,
  "ai-seats":            AISeatsTab,
  "ai-conversations":    AIConversationsTab,
  "memory-qa":           MemoryQaTab,
  "dispatch-audit":      DispatchAuditTab,
  ai:                    AIConfigTab,
  capabilities:          CapabilitiesTab,
  kb:                    KnowledgeBaseTab,
  routing:               RoutingTab,
  channels:              ChannelsTab,
  analytics:             AnalyticsTab,
  "wa-accounts":         WaMonitorTab,
  "wa-conversations":    WaConversationsTab,
  sla:                   SlaTab,
  qa:                    QaTab,
  csat:                  CsatTab,
  supervisor:            SupervisorTab,
  customers:             CustomersTab
};

const ALL_TABS = Object.keys(TAB_COMPONENTS) as Tab[];
const VALID_TABS = new Set<string>(ALL_TABS);
const DEFAULT_TAB: Tab = "overview";

function getTabLabel(tab: Tab, t: ReturnType<typeof useTranslation>["t"]) {
  if (tab === "wa-accounts") return t("waMonitor.tab");
  if (tab === "wa-conversations") return t("waConversations.tab");
  return t(`tabs.${tab}`);
}

const isAdminMembership = (m: MembershipSummary) =>
  m.role === "admin" || m.role === "tenant_admin";

const TAB_LOADING = (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
    <Spin size="large" />
  </div>
);

// ── DashboardPage ─────────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const { tab: routeTabParam } = useParams();
  const { t, i18n } = useTranslation();
  const [session, setSession]     = useState<AdminSession | null>(() => readTenantSession());
  const [collapsed, setCollapsed] = useState(false);
  const openedTabs                = useTenantTabStore((state) => state.openedTabs);
  const activeTab                 = useTenantTabStore((state) => state.activeTab);
  const refreshSeedByTab          = useTenantTabStore((state) => state.refreshSeedByTab);
  const activateTab               = useTenantTabStore((state) => state.activateTab);
  const closeTab                  = useTenantTabStore((state) => state.closeTab);
  const closeAllTabs              = useTenantTabStore((state) => state.closeAllTabs);
  const refreshTab                = useTenantTabStore((state) => state.refreshTab);
  const resetTabs                 = useTenantTabStore((state) => state.resetTabs);
  const lastTenantRef             = useRef<string | null>(null);

  const routeTab = routeTabParam && VALID_TABS.has(routeTabParam) ? routeTabParam as Tab : DEFAULT_TAB;

  const navigateToTab = useCallback((nextTab: Tab, replace = false) => {
    navigate(`/dashboard/${nextTab}`, { replace });
  }, [navigate]);

  useEffect(() => {
    registerTenantSessionUpdater(setSession);
    return () => unregisterTenantSessionUpdater();
  }, []);

  useEffect(() => {
    if (!session) {
      resetTabs(DEFAULT_TAB);
      clearTenantSession();
      navigate("/", { replace: true });
    }
  }, [navigate, resetTabs, session]);

  useEffect(() => {
    if (routeTabParam && !VALID_TABS.has(routeTabParam)) {
      navigateToTab(DEFAULT_TAB, true);
    }
  }, [navigateToTab, routeTabParam]);

  useEffect(() => {
    activateTab(routeTab);
  }, [activateTab, routeTab]);

  useEffect(() => {
    if (!session) return;

    if (lastTenantRef.current === null) {
      lastTenantRef.current = session.tenantId;
      return;
    }

    if (lastTenantRef.current !== session.tenantId) {
      lastTenantRef.current = session.tenantId;
      resetTabs(routeTab);
    }
  }, [resetTabs, routeTab, session]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<AdminNavigateDetail>).detail;
      if (detail?.tab && VALID_TABS.has(detail.tab)) navigateToTab(detail.tab);
    };
    window.addEventListener("tenant-admin:navigate", handleNavigate as EventListener);
    return () => window.removeEventListener("tenant-admin:navigate", handleNavigate as EventListener);
  }, [navigateToTab]);

  const handleSwitchTenant = useCallback(async (membershipId: string) => {
    if (!session || membershipId === session.membershipId) return;
    const data = await switchTenant(session.accessToken, membershipId);
    setSession(writeTenantSession(data));
  }, [session]);

  const handleLogout = useCallback(async () => {
    try { if (session) await logoutTenant(session); }
    finally { clearTenantSession(); navigate("/"); }
  }, [session, navigate]);

  if (!session) return null;

  const tenantKey        = session.tenantId;
  const adminMemberships = session.memberships.filter(isAdminMembership);

  // Build menu items using translation keys (re-computed when language changes)
  const menuItems: MenuProps["items"] = [
    {
      type: "group", key: "g-core", label: t("nav.groups.core"),
      children: [
        { key: "overview",             icon: <HomeOutlined />,              label: t("tabs.overview") },
        { key: "cases",                icon: <MessageOutlined />,           label: t("tabs.cases") },
        { key: "human-conversations",  icon: <MessageOutlined />,           label: t("tabs.human-conversations") },
        { key: "tasks",                icon: <CheckSquareOutlined />,       label: t("tabs.tasks") },
        { key: "organization",         icon: <ApartmentOutlined />,         label: t("tabs.organization") },
        { key: "permissions",          icon: <SafetyCertificateOutlined />, label: t("tabs.permissions") },
        { key: "shifts",               icon: <ScheduleOutlined />,          label: t("tabs.shifts") },
        { key: "agents",               icon: <TeamOutlined />,              label: t("tabs.agents") },
        { key: "ai-seats",             icon: <RobotOutlined />,             label: t("tabs.ai-seats") },
        { key: "ai-conversations",     icon: <MessageOutlined />,           label: t("tabs.ai-conversations") },
        { key: "memory-qa",            icon: <ReadOutlined />,              label: t("tabs.memory-qa") },
        { key: "dispatch-audit",       icon: <ForkOutlined />,              label: t("tabs.dispatch-audit") },
        { key: "routing",              icon: <ForkOutlined />,              label: t("tabs.routing") }
      ]
    },
    {
      type: "group", key: "g-ops", label: t("nav.groups.ops"),
      children: [
        { key: "supervisor", icon: <AreaChartOutlined />,   label: t("tabs.supervisor") },
        { key: "customers",  icon: <TagsOutlined />,        label: t("tabs.customers") },
        { key: "sla",        icon: <ClockCircleOutlined />, label: t("tabs.sla") },
        { key: "qa",         icon: <CheckSquareOutlined />, label: t("tabs.qa") },
        { key: "csat",       icon: <SmileOutlined />,       label: t("tabs.csat") },
        { key: "analytics",  icon: <AreaChartOutlined />,   label: t("tabs.analytics") }
      ]
    },
    {
      type: "group", key: "g-sys", label: t("nav.groups.sys"),
      children: [
        { key: "ai",           icon: <ThunderboltOutlined />, label: t("tabs.ai") },
        { key: "capabilities", icon: <AppstoreOutlined />,    label: t("tabs.capabilities") },
        { key: "kb",           icon: <ReadOutlined />,        label: t("tabs.kb") },
        { key: "channels",     icon: <ThunderboltOutlined />, label: t("tabs.channels") },
        { key: "wa-accounts",      icon: <MessageOutlined />, label: t("waMonitor.tab") },
        { key: "wa-conversations", icon: <MessageOutlined />, label: t("waConversations.tab") }
      ]
    }
  ];

  const langMenuItems: MenuProps["items"] = LANGS.map(({ key, label }) => ({
    key,
    label,
    onClick: () => changeLanguage(key)
  }));

  const buildTabContextMenuItems = useCallback((targetTab: Tab): MenuProps["items"] => ([
    {
      key: "refresh",
      label: t("common.refresh"),
      onClick: () => refreshTab(targetTab)
    },
    {
      key: "close-current",
      label: t("common.closeCurrent"),
      disabled: targetTab === DEFAULT_TAB,
      onClick: () => {
        if (targetTab === DEFAULT_TAB) return;
        const nextTab = closeTab(targetTab);
        if (targetTab === activeTab) {
          navigateToTab(nextTab);
        }
      }
    },
    {
      key: "close-all",
      label: t("common.closeAll"),
      disabled: openedTabs.length <= 1,
      onClick: () => {
        const nextTab = closeAllTabs(DEFAULT_TAB);
        navigateToTab(nextTab);
      }
    }
  ]), [activeTab, closeAllTabs, closeTab, navigateToTab, openedTabs.length, refreshTab, t]);

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <Sider
        theme="light"
        width={220}
        collapsed={collapsed}
        collapsedWidth={64}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{ borderRight: "1px solid #f0f0f0", height: "100vh", overflowY: "auto", overflowX: "hidden" }}
      >
        <div style={{
          height: 56, padding: "0 16px",
          display: "flex", alignItems: "center", gap: 10,
          borderBottom: "1px solid #f0f0f0", overflow: "hidden", flexShrink: 0
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #1677ff 0%, #0958d9 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 15
          }}>N</div>
          {!collapsed && (
            <div style={{ overflow: "hidden", minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#8c8c8c", lineHeight: 1.3, whiteSpace: "nowrap" }}>{t("nav.subbrand")}</div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap" }}>{t("nav.brand")}</div>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={menuItems}
          inlineCollapsed={collapsed}
          onClick={({ key }) => { if (VALID_TABS.has(key)) navigateToTab(key as Tab); }}
          style={{ borderInlineEnd: "none", paddingTop: 4 }}
        />
      </Sider>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <Layout style={{ overflow: "hidden" }}>

        {/* Topbar */}
        <Header style={{
          background: "#fff", height: 56, lineHeight: "56px",
          padding: "0 16px 0 8px", borderBottom: "1px solid #f0f0f0",
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((c) => !c)}
              style={{ fontSize: 16, color: "#595959", flexShrink: 0 }}
            />
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <Typography.Title level={5} ellipsis style={{ margin: 0, lineHeight: 1.3 }}>
                {getTabLabel(activeTab, t)}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {session.tenantSlug}
              </Typography.Text>
            </div>
          </div>

          <Space size={8} style={{ flexShrink: 0 }}>
            {adminMemberships.length > 1 && (
              <Select
                size="small"
                style={{ width: 200 }}
                value={session.membershipId}
                onChange={(v) => { void handleSwitchTenant(v); }}
                options={adminMemberships.map((m) => ({ value: m.membershipId, label: m.tenantName || m.tenantSlug }))}
              />
            )}

            {/* Language switcher */}
            <Dropdown menu={{ items: langMenuItems, selectedKeys: [i18n.language] }} placement="bottomRight">
              <Button size="small" icon={<GlobalOutlined />}>
                {LANGS.find((l) => l.key === i18n.language)?.label ?? i18n.language}
              </Button>
            </Dropdown>

            <Button size="small" icon={<LogoutOutlined />} onClick={() => { void handleLogout(); }}>
              {t("nav.logout")}
            </Button>
          </Space>
        </Header>

        <div style={{ background: "#fff", borderBottom: "1px solid #f0f0f0", padding: "0 16px" }}>
          <Tabs
            activeKey={activeTab}
            hideAdd
            type="editable-card"
            items={openedTabs.map((openedTab) => ({
              key: openedTab,
              label: (
                <Dropdown
                  menu={{ items: buildTabContextMenuItems(openedTab) }}
                  trigger={["contextMenu"]}
                >
                  <span>{getTabLabel(openedTab, t)}</span>
                </Dropdown>
              ),
              closable: openedTab !== DEFAULT_TAB
            }))}
            onChange={(key) => {
              if (VALID_TABS.has(key)) {
                navigateToTab(key as Tab);
              }
            }}
            onEdit={(targetKey, action) => {
              if (action !== "remove" || typeof targetKey !== "string" || !VALID_TABS.has(targetKey)) {
                return;
              }

              const nextTab = closeTab(targetKey as Tab);
              if (targetKey === activeTab) {
                navigateToTab(nextTab);
              }
            }}
            style={{ marginBottom: -1 }}
          />
        </div>

        {/* Scrollable content */}
        <Content style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          padding: 24, minHeight: 0, background: "#f5f7fb"
        }}>
          {openedTabs.map((openedTab) => {
            const TabComponent = TAB_COMPONENTS[openedTab];
            const refreshSeed = refreshSeedByTab[openedTab] ?? 0;

            return (
              <div
                key={`${tenantKey}:${openedTab}`}
                aria-hidden={openedTab !== activeTab}
                style={{ display: openedTab === activeTab ? "block" : "none", minHeight: "100%" }}
              >
                <Suspense fallback={openedTab === activeTab ? TAB_LOADING : null}>
                  <TabComponent key={`${tenantKey}:${openedTab}:${refreshSeed}:content`} />
                </Suspense>
              </div>
            );
          })}
        </Content>

      </Layout>
    </Layout>
  );
}
