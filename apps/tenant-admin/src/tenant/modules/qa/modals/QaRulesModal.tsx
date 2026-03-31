/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理 -> 维度配置
 * 文件职责: 维护质检评分维度的编码、名称、权重与启用状态。
 * 主要交互文件:
 * - ../QaTab.tsx
 * - ../hooks/useQaData.ts
 * - ../types.ts
 */

import { Card, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import { useTranslation } from "react-i18next";

import type { QaRulesFormValues } from "../types";

type QaRulesModalProps = {
  open: boolean;
  saving: boolean;
  form: ReturnType<typeof Form.useForm<QaRulesFormValues>>[0];
  onCancel: () => void;
  onOk: () => void;
};

export function QaRulesModal({ open, saving, form, onCancel, onOk }: QaRulesModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t("qaModule.rulesModal.title")}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okButtonProps={{ loading: saving }}
      destroyOnHidden
      width={760}
    >
      <Form form={form} layout="vertical">
        <Form.List name="rules">
          {(fields) => (
            <Space direction="vertical" style={{ width: "100%" }}>
              {fields.map((field) => (
                <Card key={field.key} size="small">
                  <Space align="start" wrap>
                    <Form.Item {...field} name={[field.name, "code"]} label={t("qaModule.rulesModal.code")} rules={[{ required: true }]}>
                      <Input style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "name"]} label={t("qaModule.rulesModal.name")} rules={[{ required: true }]}>
                      <Input style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "weight"]} label={t("qaModule.rulesModal.weight")} rules={[{ required: true }]}>
                      <InputNumber min={0} max={100} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "isActive"]} label={t("qaModule.rulesModal.enabled")}>
                      <Select
                        style={{ width: 120 }}
                        options={[
                          { value: true, label: t("qaModule.rulesModal.active") },
                          { value: false, label: t("qaModule.rulesModal.inactive") }
                        ]}
                      />
                    </Form.Item>
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
