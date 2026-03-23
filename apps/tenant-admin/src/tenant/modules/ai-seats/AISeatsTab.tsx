// 作用: AI 座席管理主入口（授权统计 + 实例列表 + 新建/编辑抽屉）
// 菜单路径: 客户中心 -> AI 座席管理
// 作者：吴川

import { Alert, Card, Form, Space, Statistic } from "antd";
import { useState } from "react";

import type { TenantAIAgent } from "../../types";
import { AISeatsTable } from "./components/AISeatsTable";
import { useAISeatsData } from "./hooks/useAISeatsData";
import { AISeatsDrawer } from "./modals/AISeatsDrawer";
import type { AISeatsFormValues } from "./types";

export function AISeatsTab() {
  const data = useAISeatsData();
  const [form] = Form.useForm<AISeatsFormValues>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<TenantAIAgent | null>(null);

  const openCreate = () => {
    setSelected(null);
    form.setFieldsValue({
      name: "", roleLabel: "", personality: "",
      scenePrompt: "", systemPrompt: "", description: "", status: "draft"
    });
    setDrawerOpen(true);
  };

  const openEdit = (item: TenantAIAgent) => {
    setSelected(item);
    form.setFieldsValue({
      name: item.name,
      roleLabel: item.roleLabel ?? "",
      personality: item.personality ?? "",
      scenePrompt: item.scenePrompt ?? "",
      systemPrompt: item.systemPrompt ?? "",
      description: item.description ?? "",
      status: item.status
    });
    setDrawerOpen(true);
  };

  const handleSave = () => {
    void (async () => {
      const values = await form.validateFields();
      const ok = await data.save(values, selected);
      if (ok) setDrawerOpen(false);
    })();
  };

  const summary = data.summary;
  const isPlatformManaged = summary?.aiModelAccessMode === "platform_managed";
  const modelLabel = summary?.aiProvider && summary?.aiModel ? `${summary.aiProvider} / ${summary.aiModel}` : "-";

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {data.error ? <Alert type="error" showIcon message={data.error} /> : null}
      {isPlatformManaged ? (
        <Alert type="info" showIcon message={`当前模型由平台统一提供：${modelLabel}`} />
      ) : (
        <Alert type="info" showIcon message={`当前模型由公司自行配置：${modelLabel}`} />
      )}

      <Space size="middle" style={{ width: "100%" }} wrap>
        <Card><Statistic title="已授权 AI 座席" value={summary?.licensedAiSeats ?? 0} /></Card>
        <Card><Statistic title="已启用 AI 座席" value={summary?.usedAiSeats ?? 0} /></Card>
        <Card><Statistic title="剩余可用" value={summary?.remainingAiSeats ?? 0} /></Card>
      </Space>

      <AISeatsTable
        rows={data.rows}
        onEdit={openEdit}
        onToggleStatus={(item) => { void data.toggleStatus(item); }}
        onDelete={(id) => { void data.remove(id); }}
        onCreate={openCreate}
      />

      <AISeatsDrawer
        open={drawerOpen}
        selected={selected}
        form={form}
        busy={data.busy}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
      />
    </Space>
  );
}
