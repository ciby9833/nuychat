// 作用: AI 配置管理主入口页面，包含两个 Tab：AI 运行策略 / AI 配置
// 菜单路径: 客户中心 -> AI 配置管理
// 作者：吴川

import { Alert, Form, Space, Tabs } from "antd";
import { useState } from "react";

import type { AIConfigProfile } from "../../types";
import { AIRuntimePolicyCard } from "./components/AIRuntimePolicyCard";
import { AIConfigTable } from "./components/AIConfigTable";
import { useAIConfigData } from "./hooks/useAIConfigData";
import { AIConfigDrawer } from "./modals/AIConfigDrawer";
import type { AIConfigFormValues, ConfigDrawerMode } from "./types";
import { normalizeProvider } from "./types";

export function AIConfigTab() {
  const [form] = Form.useForm<AIConfigFormValues>();
  const data = useAIConfigData(form);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<ConfigDrawerMode>("create");

  const onCreate = () => {
    data.setSelectedId(null);
    data.setApiKey("");
    setDrawerMode("create");
    setDrawerOpen(true);
    form.setFieldsValue({
      name: "",
      provider: "openai",
      model_name: "",
      base_url: null,
      temperature: 0.4,
      max_tokens: 500,
      system_prompt_override: null,
      is_active: true
    });
  };

  const onSelect = (cfg: AIConfigProfile) => {
    data.setSelectedId(cfg.config_id);
    data.setApiKey("");
    setDrawerMode("view");
    setDrawerOpen(true);
    form.setFieldsValue({
      name: cfg.name,
      provider: normalizeProvider(cfg.provider),
      model_name: cfg.model_name,
      base_url: cfg.base_url ?? null,
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens,
      system_prompt_override: cfg.system_prompt_override,
      is_active: cfg.is_active
    });
  };

  const onEdit = (cfg: AIConfigProfile) => {
    onSelect(cfg);
    setDrawerMode("edit");
  };

  const handleSave = () => {
    void data.save().then((ok) => {
      if (ok && data.selectedId) {
        setDrawerMode("view");
      }
    });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {data.error ? <Alert type="error" showIcon message={data.error} /> : null}
      {data.saved ? <Alert type="success" showIcon message="保存成功" /> : null}

      <Tabs
        defaultActiveKey="runtime-policy"
        items={[
          {
            key: "runtime-policy",
            label: "AI 运行策略",
            children: <AIRuntimePolicyCard />
          },
          {
            key: "ai-config",
            label: "AI 配置",
            children: (
              <>
                <AIConfigTable
                  rows={data.rows}
                  selectedId={data.selectedId}
                  onCreate={onCreate}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onSetDefault={(id) => { void data.onSetDefault(id); }}
                  onDelete={(id) => { void data.onDelete(id); }}
                />
                <AIConfigDrawer
                  open={drawerOpen}
                  mode={drawerMode}
                  selected={data.selected}
                  selectedId={data.selectedId}
                  form={form}
                  apiKey={data.apiKey}
                  busy={data.busy}
                  onApiKeyChange={data.setApiKey}
                  onClose={() => {
                    setDrawerOpen(false);
                    setDrawerMode("create");
                    data.setApiKey("");
                  }}
                  onSave={handleSave}
                  onSwitchToEdit={() => setDrawerMode("edit")}
                  onSwitchToView={() => {
                    setDrawerMode("view");
                    data.setApiKey("");
                  }}
                />
              </>
            )
          }
        ]}
      />
    </Space>
  );
}
