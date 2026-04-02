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
import { useEffect, useMemo, useState } from "react";

import { createDepartment, patchDepartment } from "../../../api";
import type { DepartmentFormValues, DepartmentItem } from "../types";

type NewDepartmentModalProps = {
  open: boolean;
  mode?: "create" | "edit";
  departments: DepartmentItem[];
  department?: DepartmentItem | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export function NewDepartmentModal({
  open,
  mode = "create",
  departments,
  department,
  onClose,
  onSubmitted
}: NewDepartmentModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm<DepartmentFormValues>();
  const [saving, setSaving] = useState(false);
  const isEdit = mode === "edit";

  const parentOptions = useMemo(
    () => departments
      .filter((item) => item.departmentId !== department?.departmentId)
      .map((item) => ({ value: item.departmentId, label: `${item.name} (${item.code})` })),
    [departments, department?.departmentId]
  );

  useEffect(() => {
    if (!open) return;
    if (isEdit && department) {
      form.setFieldsValue({
        code: department.code,
        name: department.name,
        parentDepartmentId: department.parentDepartmentId ?? undefined
      });
      return;
    }

    form.resetFields();
  }, [open, isEdit, department, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (isEdit && department) {
        await patchDepartment(department.departmentId, {
          code: values.code,
          name: values.name,
          parentDepartmentId: values.parentDepartmentId ?? null
        });
      } else {
        await createDepartment(values);
      }
      form.resetFields();
      onSubmitted();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? t("organizationModule.deptModal.editTitle") : t("organizationModule.deptModal.title")}
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText={isEdit ? t("organizationModule.deptModal.save") : t("organizationModule.deptModal.create")}
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
            options={parentOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
