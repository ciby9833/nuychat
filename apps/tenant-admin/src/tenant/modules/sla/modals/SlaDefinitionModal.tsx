/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理 -> SLA 定义弹窗
 * 文件职责: 承载 SLA 定义创建与编辑表单。
 * 主要交互文件:
 * - ../hooks/useSlaData.ts: 提供表单实例、编辑对象和保存动作。
 * - ../components/SlaDefinitionsTable.tsx: 提供打开弹窗入口。
 */

import { Form, Input, InputNumber, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";

import type { SlaDefinitionFormValues, SlaDefinitionItem } from "../types";

type SlaDefinitionModalProps = {
  open: boolean;
  saving: boolean;
  editingDefinition: SlaDefinitionItem | null;
  form: ReturnType<typeof Form.useForm<SlaDefinitionFormValues>>[0];
  onCancel: () => void;
  onOk: () => void;
};

export function SlaDefinitionModal({
  open,
  saving,
  editingDefinition,
  form,
  onCancel,
  onOk
}: SlaDefinitionModalProps) {
  const { t } = useTranslation();

  return (
    <Modal title={editingDefinition ? t("slaModule.definitionModal.editTitle") : t("slaModule.definitionModal.createTitle")} open={open} onCancel={onCancel} onOk={onOk} okButtonProps={{ loading: saving }} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("slaModule.definitionModal.name")} rules={[{ required: true, message: t("slaModule.definitionModal.nameRequired") }]}><Input /></Form.Item>
        <Form.Item name="priority" label={t("slaModule.definitionModal.priority")} rules={[{ required: true }]}><Select options={[{ value: "vip", label: "VIP" }, { value: "standard", label: "STANDARD" }]} /></Form.Item>
        <Form.Item name="firstResponseTargetSec" label={t("slaModule.definitionModal.firstResponseTargetSec")} rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="assignmentAcceptTargetSec" label={t("slaModule.definitionModal.assignmentAcceptTargetSec")} extra={t("slaModule.definitionModal.assignmentAcceptExtra")}><InputNumber min={1} style={{ width: "100%" }} placeholder={t("slaModule.definitionModal.assignmentAcceptPlaceholder")} /></Form.Item>
        <Form.Item name="followUpTargetSec" label={t("slaModule.definitionModal.followUpTargetSec")} extra={t("slaModule.definitionModal.followUpExtra")}><InputNumber min={1} style={{ width: "100%" }} placeholder={t("slaModule.definitionModal.followUpPlaceholder")} /></Form.Item>
        <Form.Item name="resolutionTargetSec" label={t("slaModule.definitionModal.resolutionTargetSec")} rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
      </Form>
    </Modal>
  );
}
