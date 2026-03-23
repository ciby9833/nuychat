// 作用: 新增成员账号弹窗
// 菜单路径: 系统设置 -> 坐席与成员管理 -> 新增成员
// 作者：吴川

import { TeamOutlined } from "@ant-design/icons";
import { Form, Input, Modal, Select, Space, message } from "antd";
import { useState } from "react";

import { createMember } from "../../../api";
import type { NewMemberForm } from "../types";
import { ROLE_OPTIONS, getActionErrorMessage } from "../types";

export function NewMemberModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form] = Form.useForm<NewMemberForm>();
  const [saving, setSaving] = useState(false);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createMember({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        displayName: values.displayName.trim(),
        employeeNo: values.employeeNo?.trim() || null,
        phone: values.phone?.trim() || null,
        idNumber: values.idNumber?.trim() || null,
        role: values.role,
        status: "active"
      });
      message.success(`成员 ${values.displayName} 已创建`);
      form.resetFields();
      onCreated();
      onClose();
    } catch (err) {
      message.error(getActionErrorMessage(err, "member_create"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<Space><TeamOutlined />新增成员账号</Space>}
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText="创建"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ role: "readonly" }}>
        <Form.Item label="姓名" name="displayName" rules={[{ required: true, message: "请输入姓名" }]}>
          <Input placeholder="张三" />
        </Form.Item>
        <Form.Item label="工号" name="employeeNo">
          <Input placeholder="A1024" />
        </Form.Item>
        <Form.Item label="手机号码" name="phone">
          <Input placeholder="138xxxxxxxx" />
        </Form.Item>
        <Form.Item label="证件号码" name="idNumber">
          <Input placeholder="身份证或其他证件号" />
        </Form.Item>
        <Form.Item
          label="登录邮箱"
          name="email"
          rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "邮箱格式不正确" }]}
        >
          <Input placeholder="member@example.com" autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="初始密码"
          name="password"
          rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "密码至少 6 位" }]}
        >
          <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="角色" name="role">
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
