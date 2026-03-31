// 作用: AI 配置查看/编辑/新建侧边抽屉
// 菜单路径: 客户中心 -> AI 配置管理 -> 查看/编辑/新建配置
// 作者：吴川

import { Button, Descriptions, Drawer, Form, Input, InputNumber, Select, Space, Switch } from "antd";
import { useTranslation } from "react-i18next";

import { SHARED_AI_PROVIDER_OPTIONS, requiresAIProviderApiKeyOnCreate, type SharedAIProvider } from "../../../../../../../packages/shared-types/src/ai-model-config";
import type { AIConfigProfile } from "../../../types";
import type { AIConfigFormValues, ConfigDrawerMode } from "../types";

export function AIConfigDrawer({
  open,
  mode,
  selected,
  selectedId,
  canEdit,
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
  canEdit: boolean;
  form: ReturnType<typeof Form.useForm<AIConfigFormValues>>[0];
  apiKey: string;
  busy: boolean;
  onApiKeyChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onSwitchToEdit: () => void;
  onSwitchToView: () => void;
}) {
  const { t } = useTranslation();
  const effectiveSelected = mode === "create" ? null : selected;
  const drawerTitle = !effectiveSelected
    ? t("aiConfig.drawer.createTitle")
    : mode === "edit"
      ? t("aiConfig.drawer.editTitle", { name: effectiveSelected.name })
      : t("aiConfig.drawer.viewTitle", { name: effectiveSelected.name });

  return (
    <Drawer
      title={drawerTitle}
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {effectiveSelected && mode === "view" ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Descriptions
            column={1}
            bordered
            items={[
              { key: "name", label: t("aiConfig.drawer.fieldName"), children: effectiveSelected.name },
              { key: "provider", label: "Provider", children: effectiveSelected.provider },
              { key: "model", label: "Model", children: effectiveSelected.model_name },
              { key: "baseUrl", label: "Base URL", children: effectiveSelected.base_url ?? "-" },
              { key: "temperature", label: "Temperature", children: effectiveSelected.temperature },
              { key: "maxTokens", label: "Max Tokens", children: effectiveSelected.max_tokens },
              { key: "prompt", label: t("aiConfig.drawer.fieldPrompt"), children: effectiveSelected.system_prompt_override || "-" },
              { key: "status", label: t("aiConfig.drawer.fieldStatus"), children: effectiveSelected.is_active ? t("aiConfig.drawer.statusActive") : t("aiConfig.drawer.statusInactive") },
              { key: "default", label: t("aiConfig.drawer.fieldDefault"), children: effectiveSelected.is_default ? t("aiConfig.drawer.yes") : t("aiConfig.drawer.no") },
              { key: "apiKey", label: t("aiConfig.drawer.fieldApiKey"), children: effectiveSelected.has_api_key ? t("aiConfig.drawer.apiKeySaved") : t("aiConfig.drawer.apiKeyMissing") }
            ]}
          />
          {canEdit ? (
            <Button type="primary" onClick={onSwitchToEdit}>
              {t("aiConfig.drawer.switchToEdit")}
            </Button>
          ) : null}
        </Space>
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item label={t("aiConfig.drawer.fieldName")} name="name" rules={[{ required: true, message: t("aiConfig.drawer.fieldNameRequired") }]}>
            <Input placeholder={t("aiConfig.drawer.fieldNamePlaceholder")} />
          </Form.Item>
          <Form.Item label="Provider" name="provider" rules={[{ required: true }]}>
            <Select
              options={[
                ...SHARED_AI_PROVIDER_OPTIONS.map((item: { value: SharedAIProvider; label: string }) => ({ value: item.value, label: item.label }))
              ]}
            />
          </Form.Item>
          <Form.Item
            label={t("aiConfig.drawer.fieldModel")}
            name="model_name"
            rules={[{ required: true, message: t("aiConfig.drawer.fieldModelRequired") }]}
          >
            <Input placeholder={t("aiConfig.drawer.fieldModelPlaceholder")} />
          </Form.Item>
          <Form.Item label={t("aiConfig.drawer.fieldBaseUrl")} name="base_url" extra={t("aiConfig.drawer.fieldBaseUrlExtra")}>
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item label="Temperature" name="temperature" rules={[{ required: true }]}>
            <InputNumber min={0} max={2} step={0.1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Max Tokens" name="max_tokens" rules={[{ required: true }]}>
            <InputNumber min={100} max={8000} step={100} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label={t("aiConfig.drawer.fieldPrompt")} name="system_prompt_override">
            <Input.TextArea rows={5} placeholder={t("aiConfig.drawer.fieldPromptPlaceholder")} />
          </Form.Item>
          <Form.Item label={t("aiConfig.drawer.fieldStatus")} name="is_active" valuePropName="checked">
            <Switch checkedChildren={t("aiConfig.drawer.statusActive")} unCheckedChildren={t("aiConfig.drawer.statusInactive")} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.provider !== next.provider}>
            {({ getFieldValue }) => {
              const provider = getFieldValue("provider");
              const providerChanged = selectedId ? provider !== selected?.provider : false;
              return requiresAIProviderApiKeyOnCreate(provider) ? (
                <Form.Item
                  label={selectedId ? t("aiConfig.drawer.fieldNewApiKey") : t("aiConfig.drawer.fieldApiKey")}
                  required={!selectedId || providerChanged || !selected?.has_api_key}
                  extra={selectedId
                    ? (providerChanged
                      ? t("aiConfig.drawer.apiKeyProviderChangedExtra")
                      : (selected?.has_api_key ? t("aiConfig.drawer.apiKeyReplaceExtra") : t("aiConfig.drawer.apiKeyMissingExtra")))
                    : t("aiConfig.drawer.apiKeyCreateExtra")}
                >
                  <Input.Password
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    autoComplete="new-password"
                    placeholder={selectedId && selected?.has_api_key && !providerChanged ? t("aiConfig.drawer.apiKeyPlaceholderKeep") : undefined}
                  />
                </Form.Item>
              ) : null;
            }}
          </Form.Item>
          <Space>
            {selected ? (
              <Button onClick={onSwitchToView}>{t("aiConfig.drawer.switchToView")}</Button>
            ) : null}
            <Button type="primary" loading={busy} onClick={onSave}>
              {selected ? t("aiConfig.drawer.save") : t("aiConfig.drawer.create")}
            </Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
}
