import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Select, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { changeLanguage, LANGS } from "../../i18n";
import { loginTenant, switchTenant } from "../api";
import { writeTenantSession } from "../session";
import type { LoginResponse } from "../types";

export function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Select
            aria-label={t("lang.switchLabel")}
            size="small"
            style={{ width: 120 }}
            value={i18n.language}
            onChange={(value) => { changeLanguage(value); }}
            options={LANGS.map(({ key, label }) => ({ value: key, label }))}
          />
        </div>
        <Typography.Text type="secondary">{t("login.brand")}</Typography.Text>
        <Typography.Title level={3} style={{ marginTop: 6 }}>{t("login.title")}</Typography.Title>
        <Typography.Paragraph type="secondary">{t("login.subtitle")}</Typography.Paragraph>
        <Form layout="vertical" autoComplete="off" onFinish={() => { void login(); }}>
          <Form.Item label={t("login.emailLabel")} required>
            <Input
              prefix={<MailOutlined />}
              type="email"
              name="tenant-admin-email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              placeholder={t("login.emailPlaceholder")}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t("login.passwordLabel")} required>
            <Input.Password
              prefix={<LockOutlined />}
              name="tenant-admin-password"
              autoComplete="off"
              value={password}
              placeholder={t("login.passwordPlaceholder")}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Item>
          {error ? <Alert style={{ marginBottom: 12 }} type="error" showIcon message={error} /> : null}
          <Button type="primary" htmlType="submit" loading={loading} block>
            {t("login.submit")}
          </Button>
        </Form>
      </Card>
    </main>
  );
}
