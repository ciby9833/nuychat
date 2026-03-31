/**
 * 菜单路径与名称: 客户中心 -> 调度审计 -> 运营建议
 * 文件职责: 渲染单个建议分组卡片，展示严重级别、摘要、建议与指标信息。
 * 主要交互文件:
 * - ../DispatchAuditTab.tsx
 * - ../../../types
 * - ../../../../i18n/locales/en/modules/dispatch-audit.ts
 * - ../../../../i18n/locales/zh/modules/dispatch-audit.ts
 * - ../../../../i18n/locales/id/modules/dispatch-audit.ts
 */

import { Card, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { DispatchOpsSuggestion } from "../../../types";

export function SuggestionGroup({ title, items }: { title: string; items: DispatchOpsSuggestion[] }) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <Card size="small" title={title}>
        <Typography.Text type="secondary">{t("dispatchAudit.ops.empty")}</Typography.Text>
      </Card>
    );
  }

  return (
    <Card size="small" title={title}>
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        {items.map((item) => (
          <Card
            key={item.key}
            size="small"
            styles={{ body: { padding: 12 } }}
            title={(
              <Space>
                <Tag color={item.severity === "high" ? "red" : item.severity === "medium" ? "orange" : "blue"}>
                  {item.severity === "high" ? t("dispatchAudit.severity.high") : item.severity === "medium" ? t("dispatchAudit.severity.medium") : t("dispatchAudit.severity.low")}
                </Tag>
                <span>{item.title}</span>
              </Space>
            )}
          >
            <Typography.Paragraph style={{ marginBottom: 8 }}>{item.summary}</Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {t("dispatchAudit.recommendationLabel")}: {item.recommendation}
            </Typography.Paragraph>
            <Space wrap>
              {Object.entries(item.metrics).map(([key, value]) => (
                <Tag key={key}>{key}: {String(value)}</Tag>
              ))}
            </Space>
          </Card>
        ))}
      </Space>
    </Card>
  );
}
