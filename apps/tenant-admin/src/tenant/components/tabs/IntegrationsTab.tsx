// 用于技能集成配置，允许管理员为内置技能配置真实的外部 API 接入点，替代默认的 mock 数据源
// 菜单路径：客户中心 -> 技能集成
// 作者：吴川
import { Button, Card, Divider, Form, Input, InputNumber, Space, Spin, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

import { getTenantAIConfig, patchTenantIntegrations } from "../../api";
import type { IntegrationConfig } from "../../types";

type SkillIntegrationDef = {
  key: string;
  label: string;
  description: string;
  endpointHint: string;
};

const SKILL_INTEGRATIONS: SkillIntegrationDef[] = [
  {
    key: "lookup_order",
    label: "订单查询 (lookup_order)",
    description: "对接订单管理系统（OMS）。配置后，skill 将实时调用此 API 代替 mock 数据。",
    endpointHint: "https://your-oms.example.com/api/orders"
  },
  {
    key: "track_shipment",
    label: "物流追踪 (track_shipment)",
    description: "对接快递 / 物流接口（JNE、J&T、SiCepat 等）。配置后将实时查询运单状态。",
    endpointHint: "https://your-logistics-api.example.com/track"
  }
];

type IntegrationFormValues = {
  endpoint: string;
  apiKey: string;
  timeout: number;
};

export function IntegrationsTab() {
  // ── Form instances MUST be created at the top level (Rules of Hooks) ──────────
  // One Form.useForm() call per skill integration, in fixed order.
  const [lookupOrderForm] = Form.useForm<IntegrationFormValues>();
  const [trackShipmentForm] = Form.useForm<IntegrationFormValues>();

  // Map skill key → form instance (stable — keys match SKILL_INTEGRATIONS)
  const formsByKey: Record<string, ReturnType<typeof Form.useForm<IntegrationFormValues>>[0]> = {
    lookup_order: lookupOrderForm,
    track_shipment: trackShipmentForm
  };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [configs, setConfigs] = useState<Record<string, IntegrationConfig>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cfg = await getTenantAIConfig();
      const integrations = cfg.integrations ?? {};
      setConfigs(integrations);
      for (const def of SKILL_INTEGRATIONS) {
        const ic = integrations[def.key];
        formsByKey[def.key]?.setFieldsValue({
          endpoint: ic?.endpoint ?? "",
          apiKey: ic?.apiKey ?? "",
          timeout: ic?.timeout ?? 5000
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupOrderForm, trackShipmentForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (skillKey: string) => {
    const form = formsByKey[skillKey];
    if (!form) return;
    const values = await form.validateFields();
    setSaving(skillKey);
    setError("");
    try {
      const updated: Record<string, IntegrationConfig> = {
        ...configs,
        [skillKey]: {
          endpoint: values.endpoint.trim() || undefined,
          apiKey: values.apiKey.trim() || undefined,
          timeout: values.timeout ?? 5000
        }
      };
      await patchTenantIntegrations(updated);
      setConfigs(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const handleClear = async (skillKey: string) => {
    setSaving(skillKey);
    setError("");
    try {
      const { [skillKey]: _removed, ...rest } = configs;
      await patchTenantIntegrations(rest);
      setConfigs(rest);
      formsByKey[skillKey]?.setFieldsValue({ endpoint: "", apiKey: "", timeout: 5000 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title="技能集成配置"
        extra={error ? <Tag color="red">{error}</Tag> : null}
      >
        <Typography.Text type="secondary">
          为内置技能配置真实外部 API 接入点。配置后，对应技能将调用真实接口代替 mock 数据。
          留空则继续使用 mock 模式（适合开发/测试）。
        </Typography.Text>
      </Card>

      {loading ? (
        <Card><Spin /></Card>
      ) : (
        SKILL_INTEGRATIONS.map((def) => {
          const isConfigured = Boolean(configs[def.key]?.endpoint);
          const form = formsByKey[def.key];
          return (
            <Card
              key={def.key}
              title={
                <Space>
                  {def.label}
                  <Tag color={isConfigured ? "green" : "default"}>
                    {isConfigured ? "已配置" : "Mock 模式"}
                  </Tag>
                </Space>
              }
            >
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                {def.description}
              </Typography.Text>

              <Form form={form} layout="vertical">
                <Form.Item
                  label="API Endpoint"
                  name="endpoint"
                  help={`示例: ${def.endpointHint}`}
                >
                  <Input placeholder={def.endpointHint} allowClear />
                </Form.Item>

                <Form.Item
                  label="API Key / Token"
                  name="apiKey"
                  help="将以 Authorization: Bearer {apiKey} 方式传入请求头。留空则不传。"
                >
                  <Input.Password placeholder="sk-xxxx 或 Bearer token" allowClear />
                </Form.Item>

                <Form.Item label="超时时间 (ms)" name="timeout">
                  <InputNumber min={500} max={30000} step={500} style={{ width: 160 }} />
                </Form.Item>

                <Divider style={{ margin: "8px 0" }} />

                <Space>
                  <Button
                    type="primary"
                    loading={saving === def.key}
                    onClick={() => { void handleSave(def.key); }}
                  >
                    保存配置
                  </Button>
                  {isConfigured && (
                    <Button
                      danger
                      disabled={saving === def.key}
                      onClick={() => { void handleClear(def.key); }}
                    >
                      清除（恢复 Mock）
                    </Button>
                  )}
                </Space>
              </Form>
            </Card>
          );
        })
      )}
    </Space>
  );
}
