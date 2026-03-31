import { UserOutlined } from "@ant-design/icons";
import { Form, InputNumber, Modal, Select, Space, Switch, message } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { createAgent } from "../../../api";
import type { MemberListItem } from "../../../types";
import type { EnableAgentForm } from "../types";
import { getActionErrorMessage, seniorityOptions } from "../types";

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
  const { t } = useTranslation();
  const [form] = Form.useForm<EnableAgentForm>();
  const [saving, setSaving] = useState(false);
  const candidates = useMemo(() => members.filter((member) => !member.agentId), [members]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createAgent({
        membershipId:   values.membershipId,
        seniorityLevel: values.seniorityLevel,
        maxConcurrency: values.maxConcurrency,
        allowAiAssist:  values.allowAiAssist
      });
      void message.success(t("agents.enable.success"));
      form.resetFields();
      onCreated();
      onClose();
    } catch (err) {
      void message.error(getActionErrorMessage(err, "agent_enable"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<Space><UserOutlined />{t("agents.enable.title")}</Space>}
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText={t("agents.enable.okText")}
      cancelText={t("common.cancel")}
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
        <Form.Item
          label={t("agents.enable.selectMember")}
          name="membershipId"
          rules={[{ required: true, message: t("agents.enable.required") }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={candidates.map((member) => ({
              value: member.membershipId,
              label: `${member.displayName ?? member.email}${member.employeeNo ? ` / ${member.employeeNo}` : ""}`
            }))}
            placeholder={candidates.length === 0 ? t("agents.enable.noMembers") : t("agents.enable.selectMember")}
          />
        </Form.Item>
        <Form.Item label={t("agents.enable.seniority")} name="seniorityLevel">
          <Select options={seniorityOptions()} />
        </Form.Item>
        <Form.Item label={t("agents.enable.maxConcurrency")} name="maxConcurrency">
          <InputNumber min={1} max={20} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label={t("agents.enable.aiAssist")} name="allowAiAssist" valuePropName="checked">
          <Switch checkedChildren={t("common.on")} unCheckedChildren={t("common.off")} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
