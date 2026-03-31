/**
 * 菜单路径与名称: 客户中心 -> SLA / 服务时限管理 -> 统计卡片
 * 文件职责: 展示违约数量、处理中数量、已确认数量与平均超时统计。
 * 主要交互文件:
 * - ../hooks/useSlaData.ts: 提供统计汇总数据。
 */

import { Card, Col, Row, Statistic } from "antd";
import { useTranslation } from "react-i18next";

type SlaSummaryCardsProps = {
  summary: {
    total: number;
    open: number;
    acknowledged: number;
    avgBreachSec: number;
  };
};

export function SlaSummaryCards({ summary }: SlaSummaryCardsProps) {
  const { t } = useTranslation();

  return (
    <Row gutter={16}>
      <Col xs={24} md={6}><Card><Statistic title={t("slaModule.summary.total")} value={summary.total} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title={t("slaModule.summary.open")} value={summary.open} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title={t("slaModule.summary.acknowledged")} value={summary.acknowledged} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title={t("slaModule.summary.average")} value={summary.avgBreachSec} /></Card></Col>
    </Row>
  );
}
