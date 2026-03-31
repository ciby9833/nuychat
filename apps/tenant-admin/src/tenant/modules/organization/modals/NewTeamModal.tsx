/**
 * 菜单路径与名称: 客户中心 -> Organization / 组织架构 -> 新建团队
 * 文件职责: 维护团队创建表单并提交创建请求。
 * 主要交互文件:
 * - ../OrganizationTab.tsx
 * - ../types.ts
 * - ../../../api
 */

import { Form, Input, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

import { createTeam } from "../../../api";
import type { AgentProfile, DepartmentItem, NewTeamFormValues } from "../types";

type NewTeamModalProps = {
  open: boolean;
  departments: DepartmentItem[];
  agents: AgentProfile[];
  defaultDepartmentId: string | null;
  onClose: () => void;
  onCreated: () => void;
};

export function NewTeamModal({
  open,
  departments,
  agents,
  defaultDepartmentId,
  onClose,
  onCreated
}: NewTeamModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm<NewTeamFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && defaultDepartmentId) {
      form.setFieldValue("departmentId", defaultDepartmentId);
    }
  }, [open, defaultDepartmentId, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createTeam(values);
      form.resetFields();
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("organizationModule.teamModal.title")}
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText={t("organizationModule.teamModal.create")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label={t("organizationModule.teamModal.department")} name="departmentId" rules={[{ required: true, message: t("organizationModule.teamModal.departmentRequired") }]}>
          <Select options={departments.map((department) => ({ value: department.departmentId, label: `${department.name} (${department.code})` }))} />
        </Form.Item>
        <Form.Item label={t("organizationModule.teamModal.code")} name="code" rules={[{ required: true, message: t("organizationModule.teamModal.codeRequired") }]} extra={t("organizationModule.teamModal.codeExtra")}>
          <Input placeholder="after-sales-a" />
        </Form.Item>
        <Form.Item label={t("organizationModule.teamModal.name")} name="name" rules={[{ required: true, message: t("organizationModule.teamModal.nameRequired") }]}>
          <Input placeholder={t("organizationModule.teamModal.name")} />
        </Form.Item>
        <Form.Item label={t("organizationModule.teamModal.supervisor")} name="supervisorAgentId">
          <Select
            allowClear
            showSearch
            placeholder={t("organizationModule.teamModal.supervisorPlaceholder")}
            optionFilterProp="label"
            options={agents.map((agent) => ({ value: agent.agentId, label: `${agent.displayName} (${agent.email})` }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
