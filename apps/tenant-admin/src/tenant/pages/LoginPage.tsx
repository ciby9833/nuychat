import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { loginTenant, switchTenant } from "../api";
import { writeTenantSession } from "../session";
import type { LoginResponse } from "../types";

export function LoginPage() {
  const navigate = useNavigate();
  // pre-fill demo credentials only in development so they are never exposed in production builds
  const [email, setEmail]       = useState(import.meta.env.DEV ? "admin@demo.com" : "");
  const [password, setPassword] = useState(import.meta.env.DEV ? "admin123"       : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      let data = (await loginTenant(email, password)) as LoginResponse;
      const adminMemberships = data.memberships.filter((m) => m.role === "admin" || m.role === "tenant_admin");
      if (adminMemberships.length === 0) {
        throw new Error("Current account has no tenant admin membership");
      }
      if (data.user.role !== "admin" && data.user.role !== "tenant_admin") {
        data = await switchTenant(data.accessToken, adminMemberships[0]!.membershipId);
      }

      writeTenantSession(data);
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <Card style={{ width: "min(460px, 100%)" }}>
        <Typography.Text type="secondary">NuyChat Tenant Admin</Typography.Text>
        <Typography.Title level={3} style={{ marginTop: 6 }}>租户管理后台登录</Typography.Title>
        <Typography.Paragraph type="secondary">使用租户管理员账号登录。</Typography.Paragraph>
        <Form layout="vertical" onFinish={() => { void login(); }}>
          <Form.Item label="Email" required>
            <Input prefix={<MailOutlined />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Form.Item>
          <Form.Item label="Password" required>
            <Input.Password prefix={<LockOutlined />} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Form.Item>
          {error ? <Alert style={{ marginBottom: 12 }} type="error" showIcon message={error} /> : null}
          <Button type="primary" htmlType="submit" loading={loading} block>
            进入后台
          </Button>
        </Form>
      </Card>
    </main>
  );
}
