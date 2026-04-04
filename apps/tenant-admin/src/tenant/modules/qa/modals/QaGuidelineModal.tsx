import { Button, Form, Input, Modal, Space, Typography } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { QaGuideline } from "../types";

const GUIDELINE_TEMPLATE = `# QA Guideline

## Principles
- Judge whether the customer's issue is actually resolved.
- Only evaluate based on the current case messages and segment timeline.

## Dimensions
### 1. Resolution
- Did the agent actually solve the customer's problem?
- Was the next step clear and actionable?

### 2. Courtesy
- Was the tone polite and respectful?

### 3. Accuracy
- Was the response correct and free of misleading information?

### 4. Compliance
- Was there any improper promise, skipped process, or out-of-scope answer?

### 5. Timeliness
- Was the response unreasonably delayed?
- Was the transfer timely and justified?

## Risk Signals
- Case was closed before the issue was resolved
- Multiple transfers without progress
- Incorrect or misleading information
- Clearly inappropriate tone or attitude

## Output Requirements
- Provide the overall case conclusion first
- Then explain segment-level responsibility
- Keep the conclusion grounded in Resolution, Courtesy, Accuracy, Compliance, and Timeliness
`;

type Props = {
  open: boolean;
  saving: boolean;
  guideline: QaGuideline | null;
  onCancel: () => void;
  onSave: (contentMd: string, name?: string) => void;
};

export function QaGuidelineModal({
  open,
  saving,
  guideline,
  onCancel,
  onSave
}: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ name: string; contentMd: string }>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: guideline?.name || "默认QA准则",
      contentMd: guideline?.contentMd || ""
    });
  }, [form, guideline, open]);

  return (
    <Modal
      title={t("qaModule.guideline.title")}
      open={open}
      width={860}
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then((values) => onSave(values.contentMd, values.name));
      }}
      confirmLoading={saving}
    >
      <Typography.Paragraph type="secondary">
        {t("qaModule.guideline.description")}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">
        {t("qaModule.guideline.helper")}
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("qaModule.guideline.name")} rules={[{ required: true, message: t("qaModule.guideline.nameRequired") }]}>
          <Input />
        </Form.Item>
        <Form.Item name="contentMd" label={t("qaModule.guideline.content")} rules={[{ required: true, message: t("qaModule.guideline.contentRequired") }]}>
          <Input.TextArea rows={18} placeholder="# QA Guideline" />
        </Form.Item>
        <Space>
          <Button onClick={() => form.setFieldValue("contentMd", GUIDELINE_TEMPLATE)}>{t("qaModule.guideline.insertTemplate")}</Button>
        </Space>
      </Form>
    </Modal>
  );
}
