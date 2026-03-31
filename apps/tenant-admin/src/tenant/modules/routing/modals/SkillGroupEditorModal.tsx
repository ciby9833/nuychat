/**
 * 菜单路径与名称: 客户中心 -> 路由 -> 技能组管理 -> 技能组编辑弹窗
 * 文件职责: 维护技能组所属模块、编码、名称、优先级与启用状态。
 * 主要交互文件:
 * - ../RoutingTab.tsx
 * - ../types.ts
 * - ../../../types
 */

import { Form, Input, InputNumber, Modal, Select, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

import type { ModuleItem, SkillGroup } from "../../../types";
import type { SkillGroupFormValues } from "../types";

export function SkillGroupEditorModal({
  open,
  saving,
  item,
  modules,
  onClose,
  onSubmit
}: {
  open: boolean;
  saving: boolean;
  item: SkillGroup | null;
  modules: ModuleItem[];
  onClose: () => void;
  onSubmit: (values: SkillGroupFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<SkillGroupFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      moduleId: item?.module_id ?? modules[0]?.moduleId ?? "",
      code: item?.code ?? "",
      name: item?.name ?? "",
      priority: item?.priority ?? 100,
      isActive: item?.is_active ?? true
    });
  }, [form, item, modules, open]);

  return (
    <Modal
      title={item ? t("routing.form.editSkillGroup") : t("routing.form.createSkillGroup")}
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
      <Form form={form} layout="vertical" initialValues={{ priority: 100, isActive: true }}>
        <Form.Item label={t("routing.form.skillGroupModule")} name="moduleId" rules={[{ required: true, message: t("routing.form.skillGroupModuleRequired") }]}>
          <Select
            options={modules.map((m) => ({
              value: m.moduleId,
              label: `${m.name} (${m.code})`
            }))}
          />
        </Form.Item>
        <Form.Item label={t("routing.form.skillGroupCode")} name="code" rules={[{ required: true, message: t("routing.form.skillGroupCodeRequired") }]}>
          <Input placeholder="GENERAL" />
        </Form.Item>
        <Form.Item label={t("routing.form.skillGroupName")} name="name" rules={[{ required: true, message: t("routing.form.skillGroupNameRequired") }]}>
          <Input placeholder="General" />
        </Form.Item>
        <Form.Item label={t("routing.table.priority")} name="priority" rules={[{ required: true }]}>
          <InputNumber min={1} max={999} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label={t("routing.form.enabled")} name="isActive" valuePropName="checked">
          <Switch checkedChildren={t("routing.state.active")} unCheckedChildren={t("routing.state.inactive")} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
