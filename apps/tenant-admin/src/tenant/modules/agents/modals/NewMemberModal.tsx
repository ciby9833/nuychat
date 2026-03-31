import { TeamOutlined } from "@ant-design/icons";
import { Form, Input, Modal, Select, Space, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { createMember } from "../../../api";
import type { NewMemberForm } from "../types";
import { getActionErrorMessage, roleOptions } from "../types";

export function NewMemberModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<NewMemberForm>();
  const [saving, setSaving] = useState(false);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createMember({
        email:       values.email.trim().toLowerCase(),
        password:    values.password,
        displayName: values.displayName.trim(),
        employeeNo:  values.employeeNo?.trim() || null,
        phone:       values.phone?.trim() || null,
        idNumber:    values.idNumber?.trim() || null,
        role:        values.role,
        status:      "active"
      });
      void message.success(t("agents.member.created", { name: values.displayName }));
      form.resetFields();
      onCreated();
      onClose();
    } catch (err) {
      void message.error(getActionErrorMessage(err, "member_create"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<Space><TeamOutlined />{t("agents.member.title")}</Space>}
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText={t("common.create")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ role: "readonly" }}>
        <Form.Item label={t("agents.member.name")} name="displayName" rules={[{ required: true, message: t("agents.member.nameRequired") }]}>
          <Input placeholder={t("agents.member.namePlaceholder")} />
        </Form.Item>
        <Form.Item label={t("agents.member.employeeNo")} name="employeeNo">
          <Input placeholder="A1024" />
        </Form.Item>
        <Form.Item label={t("agents.member.phone")} name="phone">
          <Input placeholder="138xxxxxxxx" />
        </Form.Item>
        <Form.Item label={t("agents.member.idNumber")} name="idNumber">
          <Input placeholder={t("agents.member.idPlaceholder")} />
        </Form.Item>
        <Form.Item
          label={t("agents.member.email")}
          name="email"
          rules={[
            { required: true, message: t("agents.member.emailRequired") },
            { type: "email",  message: t("agents.member.emailInvalid") }
          ]}
        >
          <Input placeholder="member@example.com" autoComplete="off" />
        </Form.Item>
        <Form.Item
          label={t("agents.member.password")}
          name="password"
          rules={[
            { required: true, message: t("agents.member.passwordRequired") },
            { min: 6,          message: t("agents.member.passwordMin") }
          ]}
        >
          <Input.Password placeholder={t("agents.member.passwordPlaceholder")} autoComplete="new-password" />
        </Form.Item>
        <Form.Item label={t("agents.member.role")} name="role">
          <Select options={roleOptions()} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
