/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理 -> 新建客户分组
 * 文件职责: 维护客户分组创建表单与分组规则条件输入。
 * 主要交互文件:
 * - ../CustomersTab.tsx
 * - ../hooks/useCustomersData.ts
 * - ../types.ts
 */

import { Form, Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

import type { CustomerSegmentFormValues } from "../types";

type CustomerSegmentModalProps = {
  open: boolean;
  form: ReturnType<typeof Form.useForm<CustomerSegmentFormValues>>[0];
  onCancel: () => void;
  onOk: () => void;
};

export function CustomerSegmentModal({ open, form, onCancel, onOk }: CustomerSegmentModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t("customersModule.segmentModal.title")}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="code" label={t("customersModule.segmentModal.code")} rules={[{ required: true }]}>
          <Input placeholder="vip_customers" />
        </Form.Item>
        <Form.Item name="name" label={t("customersModule.segmentModal.name")} rules={[{ required: true }]}>
          <Input placeholder={t("customersModule.segmentModal.namePlaceholder")} />
        </Form.Item>
        <Form.Item name="description" label={t("customersModule.segmentModal.description")}>
          <Input placeholder={t("customersModule.segmentModal.description")} />
        </Form.Item>
        <Form.Item name="tagsAny" label={t("customersModule.segmentModal.tagsAny")}>
          <Input placeholder="vip,high_risk" />
        </Form.Item>
        <Form.Item name="minConversationCount" label={t("customersModule.segmentModal.minConversationCount")}>
          <Input type="number" />
        </Form.Item>
        <Form.Item name="minTaskCount" label={t("customersModule.segmentModal.minTaskCount")}>
          <Input type="number" />
        </Form.Item>
        <Form.Item name="minCaseCount" label={t("customersModule.segmentModal.minCaseCount")}>
          <Input type="number" />
        </Form.Item>
        <Form.Item name="minOpenCaseCount" label={t("customersModule.segmentModal.minOpenCaseCount")}>
          <Input type="number" />
        </Form.Item>
        <Form.Item name="daysSinceLastConversationGte" label={t("customersModule.segmentModal.daysSinceLastConversationGte")}>
          <Input type="number" />
        </Form.Item>
        <Form.Item name="daysSinceLastCaseActivityGte" label={t("customersModule.segmentModal.daysSinceLastCaseActivityGte")}>
          <Input type="number" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
