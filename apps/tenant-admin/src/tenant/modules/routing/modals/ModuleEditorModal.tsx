import { Form, Input, Modal, Select, Switch } from "antd";
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
      title={item ? "编辑模块" : "新增模块"}
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
        <Form.Item label="模块编码" name="code" rules={[{ required: true, message: "请输入模块编码" }]}>
          <Input placeholder="GENERAL" />
        </Form.Item>
        <Form.Item label="模块名称" name="name" rules={[{ required: true, message: "请输入模块名称" }]}>
          <Input placeholder="General Support" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="运行模式" name="operatingMode" rules={[{ required: true }]}>
          <Select options={MODULE_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        </Form.Item>
        <Form.Item label="启用" name="isActive" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
