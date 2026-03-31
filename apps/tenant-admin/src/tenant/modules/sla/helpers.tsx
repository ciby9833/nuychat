/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理
 * 文件职责: 提供触发动作标签渲染、动作编辑器，以及动作类型/关闭模式国际化选项。
 * 主要交互文件:
 * - ./components/SlaTriggerPoliciesTable.tsx: 使用动作标签渲染。
 * - ./modals/SlaTriggerPolicyModal.tsx: 使用动作编辑器。
 * - ./types.ts: 提供动作类型定义。
 */

import { Button, Card, Form, Select, Space, Tag } from "antd";
import i18next from "i18next";

import type { SlaTriggerAction } from "./types";

export function getActionOptions() {
  return [
    { value: "alert", label: i18next.t("slaModule.helper.actionOptions.alert") },
    { value: "escalate", label: i18next.t("slaModule.helper.actionOptions.escalate") },
    { value: "reassign", label: i18next.t("slaModule.helper.actionOptions.reassign") },
    { value: "close_case", label: i18next.t("slaModule.helper.actionOptions.closeCase") }
  ];
}

export function getFollowUpCloseModes() {
  return [
    { value: "waiting_customer", label: i18next.t("slaModule.helper.closeModes.waitingCustomer") },
    { value: "semantic", label: i18next.t("slaModule.helper.closeModes.semantic") }
  ];
}

export function renderActionTags(actions: SlaTriggerAction[]) {
  if (!actions.length) return i18next.t("slaModule.helper.emptyActions");
  return (
    <Space wrap>
      {actions.map((action, index) => (
        <Tag key={`${action.type}-${action.mode ?? "none"}-${index}`}>
          {action.type === "close_case" && action.mode
            ? i18next.t("slaModule.helper.closeCaseWithMode", { mode: action.mode })
            : getActionOptions().find((option) => option.value === action.type)?.label ?? action.type}
        </Tag>
      ))}
    </Space>
  );
}

export function renderActionEditor(
  label: string,
  fields: Array<{ key: number; name: number }>,
  add: (defaultValue?: SlaTriggerAction, index?: number) => void,
  remove: (index: number) => void,
  listName: "firstResponseActions" | "assignmentAcceptActions" | "followUpActions" | "resolutionActions",
  allowCloseMode = false
) {
  return (
    <Card
      size="small"
      title={label}
      style={{ marginBottom: 12 }}
      extra={<Button size="small" onClick={() => add({ type: "alert" })}>{i18next.t("slaModule.helper.addAction")}</Button>}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map((field) => (
          <Space key={field.key} align="start" style={{ width: "100%" }} wrap>
            <Form.Item name={[field.name, "type"]} rules={[{ required: true }]} style={{ flex: 1, minWidth: 240, marginBottom: 0 }}>
              <Select options={getActionOptions()} style={{ width: "100%" }} popupMatchSelectWidth={false} />
            </Form.Item>
            {allowCloseMode ? (
              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const type = getFieldValue([listName, field.name, "type"]);
                  if (type !== "close_case") return null;
                  return (
                    <Form.Item name={[field.name, "mode"]} rules={[{ required: true }]} style={{ minWidth: 220, marginBottom: 0 }}>
                      <Select options={getFollowUpCloseModes()} style={{ width: "100%" }} popupMatchSelectWidth={false} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            ) : null}
            <Button danger onClick={() => remove(field.name)}>{i18next.t("slaModule.helper.delete")}</Button>
          </Space>
        ))}
      </Space>
    </Card>
  );
}
