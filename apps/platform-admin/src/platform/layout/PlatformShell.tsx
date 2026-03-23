import { LogoutOutlined } from "@ant-design/icons";
import { Alert, Avatar, Button, Layout, Menu, Space, Typography } from "antd";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const { Header, Sider, Content } = Layout;

type MenuItem = {
  key: string;
  label: string;
  to: string;
};

const MENUS: MenuItem[] = [
  { key: "overview", label: "总览", to: "/dashboard/overview" },
  { key: "tenants", label: "公司管理", to: "/dashboard/tenants" },
  { key: "marketplace", label: "技能市场", to: "/dashboard/marketplace" },
  { key: "sessions", label: "会话治理", to: "/dashboard/sessions" },
  { key: "quotas", label: "席位授权", to: "/dashboard/quotas" },
  { key: "ai-usage", label: "AI 用量", to: "/dashboard/ai-usage" },
  { key: "billing", label: "账单结算", to: "/dashboard/billing" },
  { key: "audit", label: "审计日志", to: "/dashboard/audit" }
];

function menuKeyFromPath(pathname: string) {
  const value = pathname.split("/")[2] || "overview";
  if (MENUS.some((item) => item.key === value)) return value;
  return "overview";
}

export function PlatformShell({
  email,
  title,
  subtitle,
  onLogout,
  children
}: {
  email: string;
  title: string;
  subtitle?: string;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="light" width={240} style={{ borderRight: "1px solid #f0f0f0" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #f0f0f0" }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Platform Admin</Typography.Text>
          <Typography.Title level={4} style={{ margin: "6px 0 8px" }}>NuyChat Ops</Typography.Title>
          <Space>
            <Avatar>{email.slice(0, 1).toUpperCase()}</Avatar>
            <Typography.Text>{email}</Typography.Text>
          </Space>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[menuKeyFromPath(location.pathname)]}
          items={MENUS.map((item) => ({ key: item.key, label: item.label }))}
          onClick={({ key }) => {
            const target = MENUS.find((item) => item.key === key)?.to;
            if (target) navigate(target);
          }}
          style={{ borderInlineEnd: "none", paddingTop: 8 }}
        />
        <div style={{ padding: 16 }}>
          <Button icon={<LogoutOutlined />} block onClick={() => { void onLogout(); }}>
            退出登录
          </Button>
        </div>
      </Sider>

      <Layout>
        <Header style={{ background: "#fff", borderBottom: "1px solid #f0f0f0", height: "auto", padding: "14px 20px" }}>
          <Typography.Title level={4} style={{ margin: 0 }}>{title}</Typography.Title>
          {subtitle ? (
            <Alert type={subtitle.startsWith("Error:") ? "error" : "success"} showIcon message={subtitle} style={{ marginTop: 10 }} />
          ) : null}
        </Header>
        <Content style={{ padding: 20 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
