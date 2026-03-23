import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { platformLogin } from "../api";
import { writeSession } from "../session";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await platformLogin(email, password);
      writeSession(data);
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#f5f7fb" }}>
      <Card style={{ width: "min(460px, 100%)" }}>
        <Typography.Text type="secondary">NuyChat Platform</Typography.Text>
        <Typography.Title level={3} style={{ marginTop: 6 }}>平台管理员登录</Typography.Title>
        <Typography.Paragraph type="secondary">请输入平台管理员账号。</Typography.Paragraph>
        <Form layout="vertical" onFinish={() => { void onLogin(); }}>
          <Form.Item label="Email" required>
            <Input prefix={<MailOutlined />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Form.Item>
          <Form.Item label="Password" required>
            <Input.Password prefix={<LockOutlined />} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Form.Item>
          {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
          <Button type="primary" htmlType="submit" loading={loading} block>
            进入控制台
          </Button>
        </Form>
      </Card>
    </main>
  );
}
