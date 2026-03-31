/**
 * 作用：提供 AI 运行策略编辑表单，只维护命中规则后的前置工作流规则。
 * 页面/菜单：租户管理端「AI 配置 > AI 运行策略」。
 */
import { Button, Card, Form, Input, Select, Space, Switch } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";

import type { CapabilityListItem, PreReplyPolicySet } from "../../../../types";
import { buildRuntimeCheckOptions, INTENT_OPTIONS } from "./options";

type RuntimePolicyFormValues = {
  pre_reply_policies: PreReplyPolicySet;
};

export function RuntimePolicyEditor({
  form,
  capabilities
}: {
  form: FormInstance<RuntimePolicyFormValues>;
  capabilities: CapabilityListItem[];
}) {
  const { t } = useTranslation();
  const checkOptions = buildRuntimeCheckOptions(capabilities);
  return (
    <Form form={form} layout="vertical">
      <Form.Item
        label={t("aiConfig.runtimePolicy.editorEnabled")}
        name={["pre_reply_policies", "enabled"]}
        valuePropName="checked"
        extra={t("aiConfig.runtimePolicy.editorEnabledExtra")}
      >
        <Switch checkedChildren={t("aiConfig.runtimePolicy.enabled")} unCheckedChildren={t("aiConfig.runtimePolicy.disabled")} />
      </Form.Item>
      <Form.List name={["pre_reply_policies", "rules"]}>
        {(fields, { add, remove }) => (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {fields.map((field) => (
              <Card
                key={field.key}
                size="small"
                title={(
                  <Form.Item
                    name={[field.name, "name"]}
                    style={{ margin: 0 }}
                    rules={[{ required: true, message: t("aiConfig.runtimePolicy.editorRuleNameRequired") }]}
                  >
                    <Input placeholder={t("aiConfig.runtimePolicy.editorRuleNamePlaceholder")} />
                  </Form.Item>
                )}
                extra={<Button danger type="text" onClick={() => remove(field.name)}>{t("aiConfig.runtimePolicy.editorDelete")}</Button>}
              >
                <Form.Item name={[field.name, "ruleId"]} hidden>
                  <Input />
                </Form.Item>
                <Form.Item name={[field.name, "enabled"]} valuePropName="checked" initialValue={true}>
                  <Switch checkedChildren={t("aiConfig.runtimePolicy.enabled")} unCheckedChildren={t("aiConfig.runtimePolicy.disabled")} />
                </Form.Item>
                <Form.Item
                  label={t("aiConfig.runtimePolicy.editorPreChecks")}
                  name={[field.name, "requiredChecks"]}
                  rules={[{ required: true, message: t("aiConfig.runtimePolicy.editorPreChecksRequired") }]}
                >
                  <Select mode="multiple" options={checkOptions} placeholder={t("aiConfig.runtimePolicy.editorPreChecksPlaceholder")} />
                </Form.Item>
                <Form.Item label={t("aiConfig.runtimePolicy.editorIntents")} name={[field.name, "intents"]}>
                  <Select mode="multiple" options={INTENT_OPTIONS} placeholder={t("aiConfig.runtimePolicy.editorIntentsPlaceholder")} />
                </Form.Item>
                <Form.Item label={t("aiConfig.runtimePolicy.editorKeywords")} name={[field.name, "keywords"]}>
                  <Select mode="tags" tokenSeparators={[","]} placeholder={t("aiConfig.runtimePolicy.editorKeywordsPlaceholder")} />
                </Form.Item>
                <Form.Item label={t("aiConfig.runtimePolicy.editorOnMissing")} name={[field.name, "onMissing"]} initialValue="handoff">
                  <Select options={[
                    { value: "handoff", label: t("aiConfig.runtimePolicy.onMissingHandoff") },
                    { value: "defer", label: t("aiConfig.runtimePolicy.onMissingDefer") }
                  ]}
                  />
                </Form.Item>
                <Form.Item label={t("aiConfig.runtimePolicy.editorReason")} name={[field.name, "reason"]}>
                  <Input placeholder={t("aiConfig.runtimePolicy.editorReasonPlaceholder")} />
                </Form.Item>
                <Form.Item name={[field.name, "augmentPreferredChecks"]} valuePropName="checked" initialValue={true}>
                  <Switch checkedChildren={t("aiConfig.runtimePolicy.editorPriorityOn")} unCheckedChildren={t("aiConfig.runtimePolicy.editorPriorityOff")} />
                </Form.Item>
              </Card>
            ))}
            <Button
              onClick={() => add({
                ruleId: "",
                name: "",
                enabled: true,
                requiredChecks: [],
                intents: [],
                keywords: [],
                onMissing: "handoff",
                reason: null,
                augmentPreferredChecks: true
              })}
            >
              {t("aiConfig.runtimePolicy.editorAddRule")}
            </Button>
          </Space>
        )}
      </Form.List>
    </Form>
  );
}
