/**
 * 作用：以只读方式展示单条回复前检查规则。
 * 页面/菜单：租户管理端「AI 配置 > AI 运行策略」。
 */
import { Card, Descriptions, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { CapabilityListItem, PreReplyPolicyRule } from "../../../../types";
import { ON_MISSING_LABEL } from "./options";

export function RuntimePolicyRuleViewCard({
  rule,
  capabilities
}: {
  rule: PreReplyPolicyRule;
  capabilities: CapabilityListItem[];
}) {
  const { t } = useTranslation();
  const resolveLabel = (value: string) => {
    if (value.startsWith("capability:")) {
      const code = value.slice("capability:".length);
      const capability = capabilities.find((item) => item.code === code);
      return capability ? `${t("aiConfig.runtimePolicy.capabilityPrefix")} · ${capability.name}` : value;
    }
    return value;
  };

  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      title={(
        <Space>
          <Typography.Text strong>{rule.name || t("aiConfig.runtimePolicy.unnamedRule")}</Typography.Text>
          <Tag color={rule.enabled ? "green" : "default"}>{rule.enabled ? t("aiConfig.runtimePolicy.enabled") : t("aiConfig.runtimePolicy.disabled")}</Tag>
        </Space>
      )}
    >
      <Descriptions size="small" column={1} colon>
        <Descriptions.Item label={t("aiConfig.runtimePolicy.preChecks")}>
          {rule.requiredChecks?.length
            ? rule.requiredChecks.map((check) => <Tag key={check} color="blue">{resolveLabel(check)}</Tag>)
            : <Typography.Text type="secondary">{t("aiConfig.runtimePolicy.none")}</Typography.Text>}
        </Descriptions.Item>
        <Descriptions.Item label={t("aiConfig.runtimePolicy.intents")}>
          {rule.intents?.length
            ? rule.intents.map((intent) => <Tag key={intent}>{intent}</Tag>)
            : <Typography.Text type="secondary">{t("aiConfig.runtimePolicy.allIntents")}</Typography.Text>}
        </Descriptions.Item>
        <Descriptions.Item label={t("aiConfig.runtimePolicy.keywords")}>
          {rule.keywords?.length
            ? rule.keywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)
            : <Typography.Text type="secondary">{t("aiConfig.runtimePolicy.none")}</Typography.Text>}
        </Descriptions.Item>
        <Descriptions.Item label={t("aiConfig.runtimePolicy.onMissing")}>
          {ON_MISSING_LABEL[rule.onMissing] ?? rule.onMissing ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label={t("aiConfig.runtimePolicy.reason")}>{rule.reason || "-"}</Descriptions.Item>
        <Descriptions.Item label={t("aiConfig.runtimePolicy.preferred")}>
          {rule.augmentPreferredChecks ? t("aiConfig.runtimePolicy.preferredYes") : t("aiConfig.runtimePolicy.preferredNo")}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
