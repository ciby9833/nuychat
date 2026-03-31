/**
 * 作用：AI 运行策略主卡片，作为系统级边界与兜底规则的宪法页展示。
 * 页面/菜单：租户管理端「AI 配置 > AI 运行策略」。
 */
import { Alert, Card, Descriptions, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { useRuntimePolicyData } from "../../hooks/runtime-policy/useRuntimePolicyData";

export function AIRuntimePolicyCard() {
  const { t } = useTranslation();
  const data = useRuntimePolicyData();
  const retiredRuleCount = data.policy?.pre_reply_policies.rules?.length ?? 0;

  return (
    <Card title={t("aiConfig.runtimePolicy.title")}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {data.policy ? (
          <Typography.Text type="secondary">
            {t("aiConfig.runtimePolicy.updatedAt", { time: data.policy.updated_at ?? t("aiConfig.runtimePolicy.notSaved") })}
          </Typography.Text>
        ) : null}
        {data.error ? <Alert type="error" showIcon message={data.error} /> : null}
        {retiredRuleCount > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={t("aiConfig.runtimePolicy.retiredRules", { count: retiredRuleCount })}
          />
        ) : null}
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label={t("aiConfig.runtimePolicy.descPosition")}>
            {t("aiConfig.runtimePolicy.descPositionValue")}
          </Descriptions.Item>
          <Descriptions.Item label={t("aiConfig.runtimePolicy.descCapability")}>
            {t("aiConfig.runtimePolicy.descCapabilityValue")}
          </Descriptions.Item>
          <Descriptions.Item label={t("aiConfig.runtimePolicy.descKnowledge")}>
            {t("aiConfig.runtimePolicy.descKnowledgeValue")}
          </Descriptions.Item>
          <Descriptions.Item label={t("aiConfig.runtimePolicy.descFallback")}>
            {t("aiConfig.runtimePolicy.descFallbackValue")}
          </Descriptions.Item>
        </Descriptions>
      </Space>
    </Card>
  );
}
