/**
 * 菜单路径与名称: 客户中心 -> 路由 -> 模块管理 -> 模块编辑弹窗
 * 文件职责: 维护模块基础信息、运行模式与启用状态。
 * 主要交互文件:
 * - ../RoutingTab.tsx
 * - ../types.ts
 * - ../../../types
 */

import { Form, Input, Modal, Select, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

import type { ModuleItem } from "../../../types";
import type { ModuleFormValues } from "../types";
import { MODULE_MODE_OPTIONS } from "../types";

export function ModuleEditorModal({
  open,
  saving,
  item,
  onClose,
  onSubmit
}: {
  open: boolean;
  saving: boolean;
  item: ModuleItem | null;
  onClose: () => void;
  onSubmit: (values: ModuleFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<ModuleFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      code: item?.code ?? "",
      name: item?.name ?? "",
      description: item?.description ?? "",
      operatingMode: item?.operatingMode ?? "ai_first",
      isActive: item?.isActive ?? true
    });
  }, [form, item, open]);

  return (
    <Modal
      title={item ? t("routing.form.editModule") : t("routing.form.createModule")}
      open={open}
      onCancel={onClose}
      onOk={() => {
        void (async () => {
          const values = await form.validateFields();
          await onSubmit(values);
          form.resetFields();
        })();
      }}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ operatingMode: "ai_first", isActive: true }}>
        <Form.Item label={t("routing.form.moduleCode")} name="code" rules={[{ required: true, message: t("routing.form.moduleCodeRequired") }]}>
          <Input placeholder="GENERAL" />
        </Form.Item>
        <Form.Item label={t("routing.form.moduleName")} name="name" rules={[{ required: true, message: t("routing.form.moduleNameRequired") }]}>
          <Input placeholder="General Support" />
        </Form.Item>
        <Form.Item label={t("routing.form.description")} name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label={t("routing.table.operatingMode")} name="operatingMode" rules={[{ required: true }]}>
          <Select options={MODULE_MODE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
        </Form.Item>
        <Form.Item label={t("routing.form.enabled")} name="isActive" valuePropName="checked">
          <Switch checkedChildren={t("routing.state.active")} unCheckedChildren={t("routing.state.inactive")} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
