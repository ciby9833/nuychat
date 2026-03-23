// 作用: 重置成员密码弹窗
// 菜单路径: 系统设置 -> 坐席与成员管理 -> 重置密码
// 作者：吴川

import { Form, Input, Modal } from "antd";
import { useState } from "react";

import type { MemberListItem } from "../../../types";

export function ResetPasswordModal({
  member,
  onClose,
  onReset
}: {
  member: MemberListItem | null;
  onClose: () => void;
  onReset: (password: string) => Promise<void>;
}) {
  const [form] = Form.useForm<{ password: string }>();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      title={`重置密码: ${member?.displayName ?? member?.email ?? ""}`}
      open={!!member}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => {
        void (async () => {
          const values = await form.validateFields();
          setSaving(true);
          try {
            await onReset(values.password);
            form.resetFields();
            onClose();
          } finally {
            setSaving(false);
          }
        })();
      }}
      okText="重置"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          label="新密码"
          name="password"
          rules={[{ required: true, message: "请输入新密码" }, { min: 6, message: "密码至少 6 位" }]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  );
}
