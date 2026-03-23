// 作用: 启用接待资格弹窗（为成员开通坐席）
// 菜单路径: 系统设置 -> 坐席与成员管理 -> 启用接待资格
// 作者：吴川

import { UserOutlined } from "@ant-design/icons";
import { Form, InputNumber, Modal, Select, Space, Switch, message } from "antd";
import { useMemo, useState } from "react";

import { createAgent } from "../../../api";
import type { MemberListItem } from "../../../types";
import type { EnableAgentForm } from "../types";
import { SENIORITY_LABEL, getActionErrorMessage } from "../types";

export function EnableAgentModal({
  open,
  members,
  onClose,
  onCreated
}: {
  open: boolean;
  members: MemberListItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form] = Form.useForm<EnableAgentForm>();
  const [saving, setSaving] = useState(false);
  const candidates = useMemo(() => members.filter((member) => !member.agentId), [members]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createAgent({
        membershipId: values.membershipId,
        seniorityLevel: values.seniorityLevel,
        maxConcurrency: values.maxConcurrency,
        allowAiAssist: values.allowAiAssist
      });
      message.success("已开通座席");
      form.resetFields();
      onCreated();
      onClose();
    } catch (err) {
      message.error(getActionErrorMessage(err, "agent_enable"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<Space><UserOutlined />启用接待资格</Space>}
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText="启用"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
        initialValues={{ seniorityLevel: "junior", maxConcurrency: 6, allowAiAssist: true }}
      >
        <Form.Item label="选择成员" name="membershipId" rules={[{ required: true, message: "请选择成员" }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={candidates.map((member) => ({
              value: member.membershipId,
              label: `${member.displayName ?? member.email}${member.employeeNo ? ` / ${member.employeeNo}` : ""}`
            }))}
            placeholder={candidates.length === 0 ? "没有可开通的成员" : "请选择成员"}
          />
        </Form.Item>
        <Form.Item label="资历级别" name="seniorityLevel">
          <Select options={Object.entries(SENIORITY_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        </Form.Item>
        <Form.Item label="最大并发会话数" name="maxConcurrency">
          <InputNumber min={1} max={20} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="允许 AI 辅助" name="allowAiAssist" valuePropName="checked">
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
