/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 新建/编辑能力 -> Scripts
 * 文件职责: 维护 Skill Package 中的 scripts，录入脚本内容、依赖与脚本自身环境变量。
 * 主要交互文件:
 * - ../../modals/CapabilityEditModal.tsx: 负责分步展示此区块。
 */
import { Button, Form, Input, Select, Space, Switch, Typography } from "antd";
import { useTranslation } from "react-i18next";

type ScriptFormValue = {
  scriptKey: string;
  name: string;
  fileName?: string | null;
  language?: string | null;
  sourceCode: string;
  requirements?: string[];
  envBindings?: Array<{
    envKey: string;
    envValue: string;
  }>;
  enabled?: boolean;
};

export function CapabilityScriptsSection() {
  const { t } = useTranslation();
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t("aiCapabilities.scripts.intro")}
      </Typography.Paragraph>
      <Form.List name="scripts">
        {(fields, { add, remove }) => (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {fields.map((field) => (
              <div key={field.key} style={{ padding: 16, border: "1px solid #f0f0f0", borderRadius: 12 }}>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography.Text strong>{t("aiCapabilities.scripts.script")}</Typography.Text>
                    <Button danger type="link" onClick={() => remove(field.name)}>{t("aiCapabilities.scripts.delete")}</Button>
                  </Space>
                  <Space style={{ width: "100%" }} size="middle" align="start">
                    <Form.Item
                      {...field}
                      label={t("aiCapabilities.scripts.scriptName")}
                      name={[field.name, "name"]}
                      style={{ flex: 1 }}
                      rules={[{ required: true, message: t("aiCapabilities.scripts.scriptNameRequired") }]}
                    >
                      <Input placeholder={t("aiCapabilities.scripts.scriptNamePlaceholder")} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      label={t("aiCapabilities.scripts.scriptKey")}
                      name={[field.name, "scriptKey"]}
                      style={{ flex: 1 }}
                      rules={[{ required: true, message: t("aiCapabilities.scripts.scriptKeyRequired") }]}
                    >
                      <Input placeholder={t("aiCapabilities.scripts.scriptKeyPlaceholder")} />
                    </Form.Item>
                  </Space>
                  <Space style={{ width: "100%" }} size="middle" align="start">
                    <Form.Item {...field} label={t("aiCapabilities.scripts.fileName")} name={[field.name, "fileName"]} style={{ flex: 1 }}>
                      <Input placeholder={t("aiCapabilities.scripts.fileNamePlaceholder")} />
                    </Form.Item>
                    <Form.Item {...field} label={t("aiCapabilities.scripts.language")} name={[field.name, "language"]} style={{ width: 180 }}>
                      <Input placeholder="python" />
                    </Form.Item>
                    <Form.Item {...field} label={t("aiCapabilities.scripts.enabled")} name={[field.name, "enabled"]} valuePropName="checked" initialValue>
                      <Switch />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    {...field}
                    label={t("aiCapabilities.scripts.sourceCode")}
                    name={[field.name, "sourceCode"]}
                    rules={[{ required: true, message: t("aiCapabilities.scripts.sourceCodeRequired") }]}
                  >
                    <Input.TextArea rows={12} placeholder={"def run(input, env):\n    return {\"ok\": True}\n"} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    label={t("aiCapabilities.scripts.requirements")}
                    name={[field.name, "requirements"]}
                    tooltip={t("aiCapabilities.scripts.requirementsTooltip")}
                    extra={t("aiCapabilities.scripts.requirementsExtra")}
                  >
                    <Select
                      mode="tags"
                      tokenSeparators={[",", " "]}
                      placeholder={t("aiCapabilities.scripts.requirementsPlaceholder")}
                      options={[]}
                    />
                  </Form.Item>
                  <Form.List name={[field.name, "envBindings"]}>
                    {(envFields, envOps) => (
                      <Space direction="vertical" size="small" style={{ width: "100%" }}>
                        <Typography.Text strong>{t("aiCapabilities.scripts.envVars")}</Typography.Text>
                        {envFields.map((envField) => (
                          <Space key={envField.key} style={{ width: "100%" }} align="start">
                            <Form.Item
                              {...envField}
                              name={[envField.name, "envKey"]}
                              rules={[{ required: true, message: t("aiCapabilities.scripts.envKeyRequired") }]}
                              style={{ flex: 1 }}
                            >
                              <Input placeholder={t("aiCapabilities.scripts.envKeyPlaceholder")} />
                            </Form.Item>
                            <Form.Item
                              {...envField}
                              name={[envField.name, "envValue"]}
                              rules={[{ required: true, message: t("aiCapabilities.scripts.envValueRequired") }]}
                              style={{ flex: 1 }}
                            >
                              <Input.Password placeholder={t("aiCapabilities.scripts.envValuePlaceholder")} />
                            </Form.Item>
                            <Button danger type="link" onClick={() => envOps.remove(envField.name)}>{t("aiCapabilities.scripts.delete")}</Button>
                          </Space>
                        ))}
                        <Button onClick={() => envOps.add({ envKey: "", envValue: "" })}>{t("aiCapabilities.scripts.addEnvVar")}</Button>
                      </Space>
                    )}
                  </Form.List>
                </Space>
              </div>
            ))}
            <Button
              onClick={() =>
                add({
                  name: "",
                  scriptKey: "",
                  fileName: "script.py",
                  language: "python",
                  sourceCode: "",
                  requirements: [],
                  envBindings: [],
                  enabled: true
                } satisfies ScriptFormValue)
              }
            >
              {t("aiCapabilities.scripts.addScript")}
            </Button>
          </Space>
        )}
      </Form.List>
    </>
  );
}
