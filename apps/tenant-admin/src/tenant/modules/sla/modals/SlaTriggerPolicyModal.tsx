/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理 -> 触发策略弹窗
 * 文件职责: 承载触发策略创建与编辑表单。
 * 主要交互文件:
 * - ../hooks/useSlaData.ts: 提供表单实例、编辑对象和保存动作。
 * - ../helpers.tsx: 提供动作编辑器。
 * - ../components/SlaTriggerPoliciesTable.tsx: 提供打开弹窗入口。
 */

import { Form, Input, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";

import { renderActionEditor } from "../helpers";
import type { SlaTriggerPolicyFormValues, SlaTriggerPolicyItem } from "../types";

type SlaTriggerPolicyModalProps = {
  open: boolean;
  saving: boolean;
  editingTriggerPolicy: SlaTriggerPolicyItem | null;
  form: ReturnType<typeof Form.useForm<SlaTriggerPolicyFormValues>>[0];
  onCancel: () => void;
  onOk: () => void;
};

export function SlaTriggerPolicyModal({
  open,
  saving,
  editingTriggerPolicy,
  form,
  onCancel,
  onOk
}: SlaTriggerPolicyModalProps) {
  const { t } = useTranslation();

  return (
    <Modal title={editingTriggerPolicy ? t("slaModule.triggerModal.editTitle") : t("slaModule.triggerModal.createTitle")} open={open} onCancel={onCancel} onOk={onOk} okButtonProps={{ loading: saving }} destroyOnHidden width={720}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("slaModule.triggerModal.name")} rules={[{ required: true, message: t("slaModule.triggerModal.nameRequired") }]}><Input /></Form.Item>
        <Form.Item name="priority" label={t("slaModule.triggerModal.priority")} rules={[{ required: true }]}><Select options={[{ value: "vip", label: "VIP" }, { value: "standard", label: "STANDARD" }]} /></Form.Item>
        <Form.List name="firstResponseActions">{(fields, { add, remove }) => renderActionEditor(t("slaModule.triggerModal.firstResponseActions"), fields as Array<{ key: number; name: number }>, add, remove, "firstResponseActions")}</Form.List>
        <Form.List name="assignmentAcceptActions">{(fields, { add, remove }) => renderActionEditor(t("slaModule.triggerModal.assignmentAcceptActions"), fields as Array<{ key: number; name: number }>, add, remove, "assignmentAcceptActions")}</Form.List>
        <Form.List name="followUpActions">{(fields, { add, remove }) => renderActionEditor(t("slaModule.triggerModal.followUpActions"), fields as Array<{ key: number; name: number }>, add, remove, "followUpActions", true)}</Form.List>
        <Form.List name="resolutionActions">{(fields, { add, remove }) => renderActionEditor(t("slaModule.triggerModal.resolutionActions"), fields as Array<{ key: number; name: number }>, add, remove, "resolutionActions")}</Form.List>
      </Form>
    </Modal>
  );
}
