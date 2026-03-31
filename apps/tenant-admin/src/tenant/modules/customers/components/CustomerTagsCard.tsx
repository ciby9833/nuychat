/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理 -> 标签库
 * 文件职责: 展示标签库、标签启停入口与标签创建表单。
 * 主要交互文件:
 * - ../CustomersTab.tsx
 * - ../hooks/useCustomersData.ts
 * - ../types.ts
 */

import { Button, Card, Form, Input, Tag } from "antd";
import { useTranslation } from "react-i18next";

import type { CustomerTagFormValues, CustomerTagItem } from "../types";

type CustomerTagsCardProps = {
  tags: CustomerTagItem[];
  form: ReturnType<typeof Form.useForm<CustomerTagFormValues>>[0];
  onSubmitCreate: () => void;
  onToggleTag: (tag: CustomerTagItem) => void;
};

export function CustomerTagsCard({ tags, form, onSubmitCreate, onToggleTag }: CustomerTagsCardProps) {
  const { t } = useTranslation();
  return (
    <Card title={t("customersModule.tags.title")}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tags.map((tag) => (
          <Tag key={tag.tagId} color={tag.color}>
            {tag.name}
            <Button
              size="small"
              type="link"
              style={{ paddingInline: 4 }}
              onClick={() => onToggleTag(tag)}
            >
              {tag.isActive ? t("customersModule.tags.disable") : t("customersModule.tags.enable")}
            </Button>
          </Tag>
        ))}
      </div>

      <Form form={form} layout="inline" style={{ marginTop: 12 }}>
        <Form.Item name="code" rules={[{ required: true, message: t("customersModule.tags.codeRequired") }]}>
          <Input placeholder="code" />
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, message: t("customersModule.tags.nameRequired") }]}>
          <Input placeholder={t("customersModule.tags.namePlaceholder")} />
        </Form.Item>
        <Form.Item name="color">
          <Input placeholder="#1677ff" />
        </Form.Item>
        <Form.Item name="description">
          <Input placeholder={t("customersModule.tags.descriptionPlaceholder")} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" onClick={onSubmitCreate}>{t("customersModule.tags.add")}</Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
