import { Button, Drawer, Form, Input, Select } from "antd";
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

  return (
    <Drawer
      title={editing ? t("kb.editArticle") : t("kb.addArticle")}
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
    >
      <Form form={form} layout="vertical" initialValues={{ category: "general", title: "", content: "", tags: [] }}>
        <Form.Item label={t("kb.col.category")} name="category" rules={[{ required: true }]}>
          <Select options={categories.map((category) => ({ value: category, label: category }))} />
        </Form.Item>
        <Form.Item label={t("kb.col.title")} name="title" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label={t("kb.col.content")} name="content" rules={[{ required: true }]}>
          <Input.TextArea rows={8} />
        </Form.Item>
        <Form.Item label={t("kb.tagsSeparated")}>
          <Input
            value={(form.getFieldValue("tags") ?? []).join(",")}
            onChange={(event) => form.setFieldValue("tags", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))}
          />
        </Form.Item>
        <Button type="primary" onClick={onSave}>{t("common.save")}</Button>
      </Form>
    </Drawer>
  );
}
