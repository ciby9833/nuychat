// 作用: AI 配置查看/编辑/新建侧边抽屉
// 菜单路径: 客户中心 -> AI 配置管理 -> 查看/编辑/新建配置
// 作者：吴川

import { Button, Descriptions, Drawer, Form, Input, InputNumber, Select, Space, Switch } from "antd";

import { SHARED_AI_PROVIDER_OPTIONS, requiresAIProviderApiKeyOnCreate, type SharedAIProvider } from "../../../../../../../packages/shared-types/src/ai-model-config";
import type { AIConfigProfile } from "../../../types";
import type { AIConfigFormValues, ConfigDrawerMode } from "../types";

export function AIConfigDrawer({
  open,
  mode,
  selected,
  selectedId,
  form,
  apiKey,
  busy,
  onApiKeyChange,
  onClose,
  onSave,
  onSwitchToEdit,
  onSwitchToView
}: {
  open: boolean;
  mode: ConfigDrawerMode;
  selected: AIConfigProfile | null;
  selectedId: string | null;
  form: ReturnType<typeof Form.useForm<AIConfigFormValues>>[0];
  apiKey: string;
  busy: boolean;
  onApiKeyChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onSwitchToEdit: () => void;
  onSwitchToView: () => void;
}) {
  return (
    <Drawer
      title={selected ? (mode === "edit" ? `编辑配置: ${selected.name}` : `查看配置: ${selected.name}`) : "新建 AI 配置"}
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {selected && mode === "view" ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Descriptions
            column={1}
            bordered
            items={[
              { key: "name", label: "配置名称", children: selected.name },
              { key: "provider", label: "Provider", children: selected.provider },
              { key: "model", label: "Model", children: selected.model_name },
              { key: "baseUrl", label: "Base URL", children: selected.base_url ?? "-" },
              { key: "temperature", label: "Temperature", children: selected.temperature },
              { key: "maxTokens", label: "Max Tokens", children: selected.max_tokens },
              { key: "prompt", label: "System Prompt Override", children: selected.system_prompt_override || "-" },
              { key: "status", label: "状态", children: selected.is_active ? "启用" : "停用" },
              { key: "default", label: "默认配置", children: selected.is_default ? "是" : "否" },
              { key: "apiKey", label: "API Key", children: selected.has_api_key ? "已保存，出于安全原因不展示" : "未保存" }
            ]}
          />
          <Button type="primary" onClick={onSwitchToEdit}>
            编辑配置
          </Button>
        </Space>
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item label="配置名称" name="name" rules={[{ required: true, message: "请输入配置名称" }]}>
            <Input placeholder="例如：客服主模型 / 晚间低成本模型" />
          </Form.Item>
          <Form.Item label="Provider" name="provider" rules={[{ required: true }]}>
            <Select
              options={[
                ...SHARED_AI_PROVIDER_OPTIONS.map((item: { value: SharedAIProvider; label: string }) => ({ value: item.value, label: item.label }))
              ]}
            />
          </Form.Item>
          <Form.Item
            label="Model（自由填写，不做写死限制）"
            name="model_name"
            rules={[{ required: true, message: "请输入模型名" }]}
          >
            <Input placeholder="例如：gpt-4.1-mini / gemini-2.0-flash / claude-3-7-sonnet-latest / llama3.1:8b" />
          </Form.Item>
          <Form.Item label="Base URL" name="base_url" extra="可选。适用于 OpenAI-compatible / 私有代理等场景。">
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item label="Temperature" name="temperature" rules={[{ required: true }]}>
            <InputNumber min={0} max={2} step={0.1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Max Tokens" name="max_tokens" rules={[{ required: true }]}>
            <InputNumber min={100} max={8000} step={100} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="System Prompt Override" name="system_prompt_override">
            <Input.TextArea rows={5} placeholder="可选：覆盖系统提示词" />
          </Form.Item>
          <Form.Item label="启用状态" name="is_active" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.provider !== next.provider}>
            {({ getFieldValue }) => {
              const provider = getFieldValue("provider");
              const providerChanged = selectedId ? provider !== selected?.provider : false;
              return requiresAIProviderApiKeyOnCreate(provider) ? (
                <Form.Item
                  label={selectedId ? "新的 API Key" : "API Key"}
                  required={!selectedId || providerChanged || !selected?.has_api_key}
                  extra={selectedId
                    ? (providerChanged
                      ? "切换模型厂商后必须重新填写该厂商的 API Key。"
                      : (selected?.has_api_key ? "出于安全原因不回显。留空则保留当前已保存密钥；填写后将替换。" : "当前配置未保存 API Key，请补录。"))
                    : "首次保存时必填。保存后不回显。"}
                >
                  <Input.Password
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    autoComplete="new-password"
                    placeholder={selectedId && selected?.has_api_key && !providerChanged ? "留空则保留当前已保存密钥" : undefined}
                  />
                </Form.Item>
              ) : null;
            }}
          </Form.Item>
          <Space>
            {selected ? (
              <Button onClick={onSwitchToView}>返回查看</Button>
            ) : null}
            <Button type="primary" loading={busy} onClick={onSave}>
              {selected ? "保存修改" : "创建配置"}
            </Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
}
