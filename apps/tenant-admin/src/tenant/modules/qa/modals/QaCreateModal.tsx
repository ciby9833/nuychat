/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理 -> 新建质检
 * 文件职责: 维护质检记录创建表单，包括会话选择、评分、标签、点评与状态。
 * 主要交互文件:
 * - ../QaTab.tsx
 * - ../hooks/useQaData.ts
 * - ../types.ts
 */

import { Form, Input, InputNumber, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";

import type { QaConversationOption, QaCreateFormValues } from "../types";

type QaCreateModalProps = {
  open: boolean;
  saving: boolean;
  conversations: QaConversationOption[];
  form: ReturnType<typeof Form.useForm<QaCreateFormValues>>[0];
  onCancel: () => void;
  onOk: () => void;
};

export function QaCreateModal({
  open,
  saving,
  conversations,
  form,
  onCancel,
  onOk
}: QaCreateModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t("qaModule.createModal.title")}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okButtonProps={{ loading: saving }}
      destroyOnHidden
    >
      <Form layout="vertical" form={form}>
        <Form.Item name="conversationId" label={t("qaModule.createModal.conversation")} rules={[{ required: true, message: t("qaModule.createModal.conversationRequired") }]}>
          <Select
            showSearch
            optionFilterProp="label"
            onChange={(value) => {
              const next = conversations.find((item) => item.conversationId === value);
              form.setFieldValue("caseId", next?.caseId);
            }}
            options={conversations.map((item) => ({
              value: item.conversationId,
              label: `${item.customerName ?? t("qaModule.createModal.unknownCustomer")} · ${t("qaModule.createModal.caseLabel", { id: item.caseId.slice(0, 8) })} · ${t("qaModule.createModal.conversationLabel", { id: item.conversationId.slice(0, 8) })}${item.reviewed ? t("qaModule.createModal.reviewedSuffix") : ""}`
            }))}
          />
        </Form.Item>
        <Form.Item name="caseId" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="score" label={t("qaModule.createModal.score")} rules={[{ required: true }]}>
          <InputNumber min={0} max={100} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="tags" label={t("qaModule.createModal.tags")}>
          <Input placeholder={t("qaModule.createModal.tagsPlaceholder")} />
        </Form.Item>
        <Form.Item name="note" label={t("qaModule.createModal.note")}>
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="status" label={t("qaModule.createModal.status")} rules={[{ required: true }]}>
          <Select options={[{ value: "published", label: t("qaModule.createModal.publish") }, { value: "draft", label: t("qaModule.createModal.draft") }]} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
