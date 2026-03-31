/**
 * 菜单路径与名称: 客户中心 -> AI 座席
 * 文件职责: AI 座席模块主入口，负责列表态与编辑态切换、摘要卡片展示、以及编辑器表单初始化。
 * 主要交互文件:
 * - ./hooks/useAISeatsData.ts: 负责 AI 座席列表、摘要、保存、启停、删除。
 * - ./components/AISeatsTable.tsx: 展示 AI 座席列表与行级操作。
 * - ./components/AISeatEditor.tsx: 承载 AI 座席编辑表单。
 * - ./types.ts: 定义表单类型。
 */

import { Alert, Button, Card, Form, Space, Statistic } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { TenantAIAgent } from "../../types";
import { AISeatEditor } from "./components/AISeatEditor";
import { AISeatsTable } from "./components/AISeatsTable";
import { useAISeatsData } from "./hooks/useAISeatsData";
import type { AISeatsFormValues } from "./types";

export function AISeatsTab() {
  const { t } = useTranslation();
  const data = useAISeatsData();
  const [form] = Form.useForm<AISeatsFormValues>();
  const [workspace, setWorkspace] = useState<"catalog" | "editor">("catalog");
  const [selected, setSelected] = useState<TenantAIAgent | null>(null);

  const openEditor = (item: TenantAIAgent | null) => {
    setSelected(item);
    form.setFieldsValue({
      name: item?.name ?? "",
      roleLabel: item?.roleLabel ?? "",
      personality: item?.personality ?? "",
      scenePrompt: item?.scenePrompt ?? "",
      systemPrompt: item?.systemPrompt ?? "",
      description: item?.description ?? "",
      status: item?.status ?? "draft"
    });
    setWorkspace("editor");
  };

  const handleSave = () => {
    void (async () => {
      const values = await form.validateFields();
      const ok = await data.save(values, selected);
      if (ok) setWorkspace("catalog");
    })();
  };

  const summary = data.summary;
  const isPlatformManaged = summary?.aiModelAccessMode === "platform_managed";
  const modelLabel = summary?.aiProvider && summary?.aiModel ? `${summary.aiProvider} / ${summary.aiModel}` : "-";

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {data.error ? <Alert type="error" showIcon message={data.error} /> : null}

      <Card size="small">
        <Space direction="vertical" style={{ width: "100%" }} size="small">
          <strong>{t("aiSeats.title")}</strong>
          <span>{isPlatformManaged ? t("aiSeats.modelPlatformManaged", { model: modelLabel }) : t("aiSeats.modelTenantManaged", { model: modelLabel })}</span>
        </Space>
      </Card>

      <Space size="middle" style={{ width: "100%" }} wrap>
        <Card><Statistic title={t("aiSeats.stats.licensed")} value={summary?.licensedAiSeats ?? 0} /></Card>
        <Card><Statistic title={t("aiSeats.stats.used")} value={summary?.usedAiSeats ?? 0} /></Card>
        <Card><Statistic title={t("aiSeats.stats.remaining")} value={summary?.remainingAiSeats ?? 0} /></Card>
      </Space>

      {workspace === "catalog" ? (
        <>
          <Card
            size="small"
            title={t("aiSeats.intro.title")}
            extra={<Button type="primary" onClick={() => openEditor(null)}>{t("aiSeats.actions.create")}</Button>}
          >
            {t("aiSeats.intro.description")}
          </Card>
          <AISeatsTable
            rows={data.rows}
            onView={(item) => openEditor(item)}
            onEdit={(item) => openEditor(item)}
            onToggleStatus={(item) => { void data.toggleStatus(item); }}
            onDelete={(id) => { void data.remove(id); }}
          />
        </>
      ) : (
        <Card
          size="small"
          title={selected ? t("aiSeats.editor.editTitle", { name: selected.name }) : t("aiSeats.editor.createTitle")}
          extra={(
            <Space>
              <Button onClick={() => setWorkspace("catalog")}>{t("aiSeats.actions.backToList")}</Button>
              <Button type="primary" loading={data.busy} onClick={handleSave}>{t("aiSeats.actions.save")}</Button>
            </Space>
          )}
        >
          <AISeatEditor form={form} selected={selected} />
        </Card>
      )}
    </Space>
  );
}
