/**
 * 菜单路径与名称: 客户中心 -> AI 座席 -> 座席详情
 * 文件职责: 承载 AI 座席的编辑表单，维护名称、角色、人格设定、服务场景、系统提示词和状态。
 * 主要交互文件:
 * - ../AISeatsTab.tsx: 负责创建 form 与保存提交。
 * - ../types.ts: 提供 AISeatsFormValues 类型。
 * - ../../../types: 提供 TenantAIAgent 类型。
 */

import { Card, Form, Input, Select } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";

import type { TenantAIAgent } from "../../../types";
import type { AISeatsFormValues } from "../types";

export function AISeatEditor({
  form,
  selected
}: {
  form: FormInstance<AISeatsFormValues>;
  selected: TenantAIAgent | null;
}) {
  const { t } = useTranslation();
  return (
    <Card size="small" title={selected ? selected.name : t("aiSeats.editor.innerCreateTitle")}>
      <Form form={form} layout="vertical">
        <Form.Item label={t("aiSeats.editor.name")} name="name" rules={[{ required: true, message: t("aiSeats.editor.nameRequired") }]}>
          <Input placeholder={t("aiSeats.editor.namePlaceholder")} />
        </Form.Item>
        <Form.Item label={t("aiSeats.editor.role")} name="roleLabel">
          <Input placeholder={t("aiSeats.editor.rolePlaceholder")} />
        </Form.Item>
        <Form.Item label={t("aiSeats.editor.personality")} name="personality">
          <Input.TextArea rows={3} placeholder={t("aiSeats.editor.personalityPlaceholder")} />
        </Form.Item>
        <Form.Item label={t("aiSeats.editor.scenePrompt")} name="scenePrompt">
          <Input.TextArea rows={3} placeholder={t("aiSeats.editor.scenePromptPlaceholder")} />
        </Form.Item>
        <Form.Item label={t("aiSeats.editor.systemPrompt")} name="systemPrompt">
          <Input.TextArea rows={7} placeholder={t("aiSeats.editor.systemPromptPlaceholder")} />
        </Form.Item>
        <Form.Item label={t("aiSeats.editor.description")} name="description">
          <Input.TextArea rows={4} placeholder={t("aiSeats.editor.descriptionPlaceholder")} />
        </Form.Item>
        <Form.Item label={t("aiSeats.editor.status")} name="status" rules={[{ required: true, message: t("aiSeats.editor.statusRequired") }]}>
          <Select
            options={[
              { value: "draft", label: t("aiSeats.status.draft") },
              { value: "active", label: t("aiSeats.status.active") },
              { value: "inactive", label: t("aiSeats.status.inactive") }
            ]}
          />
        </Form.Item>
      </Form>
    </Card>
  );
}
