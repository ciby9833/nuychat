/**
 * 菜单路径与名称: 客户中心 -> Organization / 组织架构 -> 新建部门
 * 文件职责: 维护部门创建表单并提交创建请求。
 * 主要交互文件:
 * - ../OrganizationTab.tsx
 * - ../types.ts
 * - ../../../api
 */

import { Form, Input, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import { createDepartment } from "../../../api";
import type { DepartmentItem, NewDepartmentFormValues } from "../types";

type NewDepartmentModalProps = {
  open: boolean;
  departments: DepartmentItem[];
  onClose: () => void;
  onCreated: () => void;
};

export function NewDepartmentModal({
  open,
  departments,
  onClose,
  onCreated
}: NewDepartmentModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm<NewDepartmentFormValues>();
  const [saving, setSaving] = useState(false);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createDepartment(values);
      form.resetFields();
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("organizationModule.deptModal.title")}
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText={t("organizationModule.deptModal.create")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label={t("organizationModule.deptModal.code")} name="code" rules={[{ required: true, message: t("organizationModule.deptModal.codeRequired") }]} extra={t("organizationModule.deptModal.codeExtra")}>
          <Input placeholder="after-sales" />
        </Form.Item>
        <Form.Item label={t("organizationModule.deptModal.name")} name="name" rules={[{ required: true, message: t("organizationModule.deptModal.nameRequired") }]}>
          <Input placeholder={t("organizationModule.deptModal.name")} />
        </Form.Item>
        <Form.Item label={t("organizationModule.deptModal.parent")} name="parentDepartmentId">
          <Select
            allowClear
            placeholder={t("organizationModule.deptModal.parentPlaceholder")}
            options={departments.map((department) => ({ value: department.departmentId, label: `${department.name} (${department.code})` }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
