/**
 * 菜单路径与名称: 平台配置 -> AI 能力
 * 文件职责: AI 能力目录主页面，负责能力列表、详情面板，以及新建、编辑、删除入口。
 * 主要交互文件:
 * - ../hooks/useCapabilityRegistryData.ts: 提供列表、详情与 CRUD 方法。
 * - ../components/CapabilityRegistryTable.tsx: 渲染能力列表与行内操作。
 * - ../components/CapabilityDetailCard.tsx: 渲染当前能力详情。
 * - ../modals/CapabilityEditModal.tsx: 承载新建/编辑表单。
 */
import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Modal, Space, Typography, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityDetailCard } from "../components/CapabilityDetailCard";
import { CapabilityRegistryTable } from "../components/CapabilityRegistryTable";
import { useCapabilityRegistryData } from "../hooks/useCapabilityRegistryData";
import { CapabilityEditModal } from "../modals/CapabilityEditModal";

export function CapabilityRegistryPage() {
  const { t } = useTranslation();
  const { items, detail, selectedId, loading, detailLoading, error, loadDetail, createItem, updateItem, deleteItem } = useCapabilityRegistryData();
  const [editingMode, setEditingMode] = useState<"create" | "edit" | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {error ? <Alert type="error" showIcon message={error} closable /> : null}

      <Card
        title={t("aiCapabilities.page.title")}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditingMode("create")}>
            {t("aiCapabilities.page.create")}
          </Button>
        }
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {t("aiCapabilities.page.intro")}
          {t("aiCapabilities.page.intro2")}
        </Typography.Paragraph>
        <CapabilityRegistryTable
          items={items}
          loading={loading}
          selectedId={selectedId}
          onSelect={(capabilityId) => { void loadDetail(capabilityId); }}
          onEdit={(capabilityId) => {
            void loadDetail(capabilityId).then(() => setEditingMode("edit"));
          }}
          onDelete={(capabilityId, name) => {
            Modal.confirm({
              title: t("aiCapabilities.page.deleteTitle", { name }),
              content: t("aiCapabilities.page.deleteContent"),
              okText: t("aiCapabilities.page.deleteOk"),
              okButtonProps: { danger: true },
              cancelText: t("common.cancel"),
              onOk: async () => {
                await deleteItem(capabilityId);
                void message.success(t("aiCapabilities.page.deleted"));
              }
            });
          }}
        />
      </Card>

      {selectedId ? (
        <Card title={t("aiCapabilities.page.detailTitle")}>
          <CapabilityDetailCard detail={detail} loading={detailLoading} />
        </Card>
      ) : null}

      <CapabilityEditModal
        open={editingMode !== null}
        mode={editingMode ?? "create"}
        loading={saving}
        initialValue={editingMode === "edit" ? detail : null}
        onCancel={() => setEditingMode(null)}
        onSubmit={async (input) => {
          setSaving(true);
          try {
            if (editingMode === "create") await createItem(input);
            else if (detail) await updateItem(detail.capabilityId, input);
            void message.success(editingMode === "create" ? t("aiCapabilities.page.created") : t("aiCapabilities.page.updated"));
            setEditingMode(null);
          } finally {
            setSaving(false);
          }
        }}
      />
    </Space>
  );
}
