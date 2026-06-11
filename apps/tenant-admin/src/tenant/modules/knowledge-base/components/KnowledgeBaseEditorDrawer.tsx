import { Alert, Button, Drawer, Form, Input, Select, Space, Statistic } from "antd";
import { useTranslation } from "react-i18next";

import type { KBEntry, KBFormData } from "../types";

type KnowledgeBaseEditorDrawerProps = {
  open: boolean;
  editing: KBEntry | null;
  categories: string[];
  form: ReturnType<typeof Form.useForm<KBFormData>>[0];
  onClose: () => void;
  onSave: () => void;
};

export function KnowledgeBaseEditorDrawer({
  open,
  editing,
  categories,
  form,
  onClose,
  onSave
}: KnowledgeBaseEditorDrawerProps) {
  const { t } = useTranslation();
  const isReview = editing?.needs_review ?? false;

  return (
    <Drawer
      title={editing ? t("kb.editArticle") : t("kb.addArticle")}
      placement="right"
      width={560}
      open={open}
      onClose={onClose}
    >
      {/* Quality warning banner — only for flagged entries */}
      {isReview && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("kb.reviewAlert.title")}
          description={t("kb.reviewAlert.desc", { count: editing?.negative_feedback_count ?? 0 })}
        />
      )}

      {/* Quality stats row — only when editing an existing entry */}
      {editing && (
        <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
          <Statistic title={t("kb.col.hits")} value={editing.hit_count} valueStyle={{ fontSize: 16 }} />
          <Statistic
            title={t("kb.col.negativeFeedback")}
            value={editing.negative_feedback_count}
            valueStyle={{ fontSize: 16, color: editing.negative_feedback_count >= 3 ? "#fa8c16" : undefined }}
          />
          {editing.last_used_at && (
            <Statistic
              title={t("kb.col.lastUsed")}
              value={new Date(editing.last_used_at).toLocaleDateString()}
              valueStyle={{ fontSize: 14 }}
            />
          )}
        </Space>
      )}

      <Form form={form} layout="vertical" initialValues={{ category: "general", title: "", content: "", tags: [] }}>
        <Form.Item label={t("kb.col.category")} name="category" rules={[{ required: true }]}>
          <Select options={categories.map((category) => ({ value: category, label: category }))} />
        </Form.Item>
        <Form.Item label={t("kb.col.title")} name="title" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label={t("kb.col.content")} name="content" rules={[{ required: true }]}>
          <Input.TextArea rows={10} />
        </Form.Item>
        <Form.Item label={t("kb.tagsSeparated")}>
          <Input
            value={(form.getFieldValue("tags") ?? []).join(",")}
            onChange={(event) =>
              form.setFieldValue("tags", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))
            }
          />
        </Form.Item>
        {isReview && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={t("kb.reviewAlert.saveHint")}
          />
        )}
        <Button type="primary" onClick={onSave}>{t("common.save")}</Button>
      </Form>
    </Drawer>
  );
}
