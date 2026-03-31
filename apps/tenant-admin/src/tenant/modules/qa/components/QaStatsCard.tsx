/**
 * 菜单路径与名称: 客户中心 -> QA / 质检管理 -> 统计卡片
 * 文件职责: 展示质检总数、当前页平均分和质检维度数量。
 * 主要交互文件:
 * - ../QaTab.tsx
 * - ../hooks/useQaData.ts
 */

import { Card, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

type QaStatsCardProps = {
  total: number;
  averageScore: number;
  ruleCount: number;
};

export function QaStatsCard({ total, averageScore, ruleCount }: QaStatsCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <Space size={28}>
        <div>
          <Typography.Text type="secondary">{t("qaModule.stats.total")}</Typography.Text>
          <Typography.Title level={4} style={{ margin: 0 }}>{total}</Typography.Title>
        </div>
        <div>
          <Typography.Text type="secondary">{t("qaModule.stats.average")}</Typography.Text>
          <Typography.Title level={4} style={{ margin: 0 }}>{averageScore}</Typography.Title>
        </div>
        <div>
          <Typography.Text type="secondary">{t("qaModule.stats.rules")}</Typography.Text>
          <Typography.Title level={4} style={{ margin: 0 }}>{ruleCount}</Typography.Title>
        </div>
      </Space>
    </Card>
  );
}
