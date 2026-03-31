// 作用: 重置成员密码弹窗
// 菜单路径: 系统设置 -> 坐席与成员管理 -> 重置密码
// 作者：吴川

import { Form, Input, Modal } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [form] = Form.useForm<{ password: string }>();
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      title={t("agents.member.resetPasswordTitle", { name: member?.displayName ?? member?.email ?? "" })}
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
      okText={t("agents.member.resetPassword")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          label={t("agents.member.newPassword")}
          name="password"
          rules={[{ required: true, message: t("agents.member.newPasswordRequired") }, { min: 6, message: t("agents.member.passwordMin") }]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  );
}
