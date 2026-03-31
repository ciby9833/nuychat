import { Card, Space, Statistic } from "antd";

type CsatSummaryCardsProps = {
  summary: {
    total: number;
    scheduled: number;
    responded: number;
  };
  averageRating: number;
};

export function CsatSummaryCards({ summary, averageRating }: CsatSummaryCardsProps) {
  return (
    <Card>
      <Space size={24} wrap>
        <Statistic title="调查总数" value={summary.total} />
        <Statistic title="已响应" value={summary.responded} />
        <Statistic title="待发送" value={summary.scheduled} />
        <Statistic title="平均满意度" value={averageRating} suffix="★" precision={2} />
      </Space>
    </Card>
  );
}
