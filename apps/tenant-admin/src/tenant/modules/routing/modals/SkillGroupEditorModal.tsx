import { Form, Input, InputNumber, Modal, Select, Switch } from "antd";
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
      title={item ? "编辑技能组" : "新增技能组"}
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
        <Form.Item label="所属模块" name="moduleId" rules={[{ required: true, message: "请选择模块" }]}>
          <Select
            options={modules.map((m) => ({
              value: m.moduleId,
              label: `${m.name} (${m.code})`
            }))}
          />
        </Form.Item>
        <Form.Item label="技能组编码" name="code" rules={[{ required: true, message: "请输入技能组编码" }]}>
          <Input placeholder="GENERAL" />
        </Form.Item>
        <Form.Item label="技能组名称" name="name" rules={[{ required: true, message: "请输入技能组名称" }]}>
          <Input placeholder="General" />
        </Form.Item>
        <Form.Item label="优先级" name="priority" rules={[{ required: true }]}>
          <InputNumber min={1} max={999} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="启用" name="isActive" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
