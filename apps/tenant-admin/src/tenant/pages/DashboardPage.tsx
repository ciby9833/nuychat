import {
  ApiOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  AreaChartOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ControlOutlined,
  ForkOutlined,
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
import { Button, Layout, Menu, Select, Space, Spin, Typography } from "antd";
import type { MenuProps } from "antd";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";

import { logoutTenant, registerTenantSessionUpdater, switchTenant, unregisterTenantSessionUpdater } from "../api";
import { clearTenantSession, readTenantSession, writeTenantSession } from "../session";
import type { AdminSession, MembershipSummary, Tab } from "../types";

type AdminNavigateDetail = {
  tab: Tab;
};

const { Header, Sider, Content } = Layout;

// ── lazy-load each tab so Vite splits them into separate chunks ──────────────
// (only the visible tab's JS is parsed; initial bundle is much smaller)

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
const KnowledgeBaseTab   = lazy(() => import("../components/tabs/KnowledgeBaseTab").then(m => ({ default: m.KnowledgeBaseTab })));
const RoutingTab         = lazy(() => import("../components/tabs/RoutingTab").then(m => ({ default: m.RoutingTab })));
const ChannelsTab        = lazy(() => import("../components/tabs/ChannelsTab").then(m => ({ default: m.ChannelsTab })));
const MarketplaceTab     = lazy(() => import("../components/tabs/MarketplaceTab").then(m => ({ default: m.MarketplaceTab })));
const IntegrationsTab    = lazy(() => import("../components/tabs/IntegrationsTab").then(m => ({ default: m.IntegrationsTab })));
const AnalyticsTab       = lazy(() => import("../components/tabs/AnalyticsTab").then(m => ({ default: m.AnalyticsTab })));
const SlaTab             = lazy(() => import("../components/tabs/SlaTab").then(m => ({ default: m.SlaTab })));
const QaTab              = lazy(() => import("../components/tabs/QaTab").then(m => ({ default: m.QaTab })));
const CsatTab            = lazy(() => import("../components/tabs/CsatTab").then(m => ({ default: m.CsatTab })));
const SupervisorTab      = lazy(() => import("../components/tabs/SupervisorTab").then(m => ({ default: m.SupervisorTab })));
const CustomersTab       = lazy(() => import("../components/tabs/CustomersTab").then(m => ({ default: m.CustomersTab })));

// ── tab metadata ─────────────────────────────────────────────────────────────

const TAB_LABELS: Record<Tab, string> = {
  overview:           "概览",
  cases:              "事项视角",
  "human-conversations": "人工会话",
  tasks:              "任务管理",
  organization:       "组织架构",
  permissions:        "权限策略",
  shifts:             "排班与在线",
  agents:             "坐席管理",
  "ai-seats":         "AI 座席",
  "ai-conversations": "AI 会话",
  "memory-qa":       "Memory QA",
  "dispatch-audit":   "调度依据",
  ai:                 "AI 配置",
  kb:                 "知识库",
  routing:            "路由规则",
  channels:           "渠道配置",
  marketplace:        "技能市场",
  integrations:       "集成配置",
  analytics:          "数据分析",
  sla:                "SLA 管理",
  qa:                 "质检系统",
  csat:               "满意度调查",
  supervisor:         "主管工作台",
  customers:          "客户标签与分组"
};

// TypeScript enforces exhaustive coverage: missing Tab key = compile error
const TAB_COMPONENTS: Record<Tab, ComponentType> = {
  overview:           OverviewTab,
  cases:              CasesTab,
  "human-conversations": HumanConversationsTab,
  tasks:              TasksTab,
  organization:       OrganizationTab,
  permissions:        PermissionsTab,
  shifts:             ShiftsTab,
  agents:             AgentsTab,
  "ai-seats":         AISeatsTab,
  "ai-conversations": AIConversationsTab,
  "memory-qa":        MemoryQaTab,
  "dispatch-audit":   DispatchAuditTab,
  ai:                 AIConfigTab,
  kb:                 KnowledgeBaseTab,
  routing:            RoutingTab,
  channels:           ChannelsTab,
  marketplace:        MarketplaceTab,
  integrations:       IntegrationsTab,
  analytics:          AnalyticsTab,
  sla:                SlaTab,
  qa:                 QaTab,
  csat:               CsatTab,
  supervisor:         SupervisorTab,
  customers:          CustomersTab
};

// Group header keys ("group-core" etc.) must not trigger navigation
const VALID_TABS = new Set<string>(Object.keys(TAB_LABELS));

// ── menu items ───────────────────────────────────────────────────────────────

const MENU_ITEMS: MenuProps["items"] = [
  {
    type: "group", key: "g-core", label: "基础管理",
    children: [
      { key: "overview",          icon: <HomeOutlined />,               label: TAB_LABELS.overview },
      { key: "cases",             icon: <MessageOutlined />,            label: TAB_LABELS.cases },
      { key: "human-conversations", icon: <MessageOutlined />,          label: TAB_LABELS["human-conversations"] },
      { key: "tasks",             icon: <CheckSquareOutlined />,        label: TAB_LABELS.tasks },
      { key: "organization",      icon: <ApartmentOutlined />,          label: TAB_LABELS.organization },
      { key: "permissions",       icon: <SafetyCertificateOutlined />,  label: TAB_LABELS.permissions },
      { key: "shifts",            icon: <ScheduleOutlined />,           label: TAB_LABELS.shifts },
      { key: "agents",            icon: <TeamOutlined />,               label: TAB_LABELS.agents },
      { key: "ai-seats",          icon: <RobotOutlined />,              label: TAB_LABELS["ai-seats"] },
      { key: "ai-conversations",  icon: <MessageOutlined />,            label: TAB_LABELS["ai-conversations"] },
      { key: "memory-qa",         icon: <ReadOutlined />,               label: TAB_LABELS["memory-qa"] },
      { key: "dispatch-audit",    icon: <ForkOutlined />,               label: TAB_LABELS["dispatch-audit"] },
      { key: "routing",           icon: <ForkOutlined />,               label: TAB_LABELS.routing }
    ]
  },
  {
    type: "group", key: "g-ops", label: "运营管理",
    children: [
      { key: "supervisor", icon: <AreaChartOutlined />,   label: TAB_LABELS.supervisor },
      { key: "customers",  icon: <TagsOutlined />,        label: TAB_LABELS.customers },
      { key: "sla",        icon: <ClockCircleOutlined />, label: TAB_LABELS.sla },
      { key: "qa",         icon: <CheckSquareOutlined />, label: TAB_LABELS.qa },
      { key: "csat",       icon: <SmileOutlined />,       label: TAB_LABELS.csat },
      { key: "analytics",  icon: <AreaChartOutlined />,   label: TAB_LABELS.analytics }
    ]
  },
  {
    type: "group", key: "g-sys", label: "平台配置",
    children: [
      { key: "ai",           icon: <ThunderboltOutlined />, label: TAB_LABELS.ai },
      { key: "kb",           icon: <ReadOutlined />,        label: TAB_LABELS.kb },
      { key: "channels",     icon: <ApiOutlined />,         label: TAB_LABELS.channels },
      { key: "marketplace",  icon: <AppstoreOutlined />,    label: TAB_LABELS.marketplace },
      { key: "integrations", icon: <ControlOutlined />,     label: TAB_LABELS.integrations }
    ]
  }
];

// ── helpers ──────────────────────────────────────────────────────────────────

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
  const [tab, setTab]             = useState<Tab>("overview");
  const [session, setSession]     = useState<AdminSession | null>(() => readTenantSession());
  const [collapsed, setCollapsed] = useState(false);

  // keep React state in sync with silent token refreshes in api.ts
  useEffect(() => {
    registerTenantSessionUpdater(setSession);
    return () => unregisterTenantSessionUpdater();
  }, []);

  // redirect to login when session expires or is cleared
  useEffect(() => {
    if (!session) { clearTenantSession(); navigate("/", { replace: true }); }
  }, [session, navigate]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<AdminNavigateDetail>).detail;
      if (detail?.tab && VALID_TABS.has(detail.tab)) {
        setTab(detail.tab);
      }
    };

    window.addEventListener("tenant-admin:navigate", handleNavigate as EventListener);
    return () => window.removeEventListener("tenant-admin:navigate", handleNavigate as EventListener);
  }, []);

  // define handlers before the conditional return so hook order is always stable
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

  // Only changes on tenant switch, NOT on tab change.
  // This remounts the active tab when the tenant switches (clearing stale data)
  // but avoids remounting — and unnecessary refetching — on every menu click.
  const tenantKey = session.tenantId;

  const adminMemberships = session.memberships.filter(isAdminMembership);
  const ActiveTab        = TAB_COMPONENTS[tab];

  return (
    /**
     * Layout strategy:
     *   • Outer Layout  → height 100vh + overflow hidden → caps total height at viewport
     *   • Sider         → height 100vh, scrolls its own overflow if menu is very long
     *   • Inner Layout  → flex column, fills remaining width; overflow hidden
     *   • Header        → fixed 56 px, never scrolls
     *   • Content       → flex:1 + overflow-y auto + minHeight:0 → scrolls independently
     *
     * Result: sidebar and topbar are always visible; only the page content scrolls.
     */
    <Layout style={{ height: "100vh", overflow: "hidden" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <Sider
        theme="light"
        width={220}
        collapsed={collapsed}
        collapsedWidth={64}
        breakpoint="lg"                          // auto-collapse below 992 px
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{
          borderRight: "1px solid #f0f0f0",
          height: "100vh",
          overflowY: "auto",
          overflowX: "hidden"
        }}
      >
        {/* Brand mark */}
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
          }}>
            N
          </div>
          {!collapsed && (
            <div style={{ overflow: "hidden", minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#8c8c8c", lineHeight: 1.3, whiteSpace: "nowrap" }}>NuyChat</div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap" }}>Nuyyess管理后台</div>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[tab]}
          items={MENU_ITEMS}
          inlineCollapsed={collapsed}
          onClick={({ key }) => { if (VALID_TABS.has(key)) setTab(key as Tab); }}
          style={{ borderInlineEnd: "none", paddingTop: 4 }}
        />
      </Sider>

      {/* ── Main column (header + scrollable content) ─────────────────── */}
      <Layout style={{ overflow: "hidden" }}>

        {/* Topbar */}
        <Header style={{
          background: "#fff",
          height: 56,
          lineHeight: "56px",
          padding: "0 16px 0 8px",
          borderBottom: "1px solid #f0f0f0",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          {/* Left: collapse toggle + page title — flex:1 + minWidth:0 lets it
              shrink gracefully when the right side needs space */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            flex: 1, minWidth: 0, overflow: "hidden"
          }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((c) => !c)}
              style={{ fontSize: 16, color: "#595959", flexShrink: 0 }}
            />
            {/* minWidth:0 on the text block so ellipsis triggers instead of overflow */}
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <Typography.Title
                level={5}
                ellipsis
                style={{ margin: 0, lineHeight: 1.3 }}
              >
                {TAB_LABELS[tab]}
              </Typography.Title>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 11, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {session.tenantSlug}
              </Typography.Text>
            </div>
          </div>

          {/* Right: tenant switcher + logout — flexShrink:0 so it is never squeezed */}
          <Space size={8} style={{ flexShrink: 0 }}>
            {adminMemberships.length > 1 && (
              <Select
                size="small"
                style={{ width: 200 }}
                value={session.membershipId}
                onChange={(v) => { void handleSwitchTenant(v); }}
                options={adminMemberships.map((m) => ({
                  value: m.membershipId,
                  label: m.tenantName || m.tenantSlug
                }))}
              />
            )}
            <Button
              size="small"
              icon={<LogoutOutlined />}
              onClick={() => { void handleLogout(); }}
            >
              退出登录
            </Button>
          </Space>
        </Header>

        {/* Scrollable content — only this area scrolls */}
        <Content style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: 24,
          minHeight: 0,          // without this, flex children ignore overflow-y
          background: "#f5f7fb"
        }}>
          <Suspense fallback={TAB_LOADING}>
            <ActiveTab key={tenantKey} />
          </Suspense>
        </Content>

      </Layout>
    </Layout>
  );
}
