import { Card, Col, Row, Statistic } from "antd";

export function OverviewSection({
  totalTenants,
  sessionTotal,
  auditTotal,
  loading,
  error,
  notice
}: {
  totalTenants: number;
  sessionTotal: number;
  auditTotal: number;
  loading: boolean;
  error: string;
  notice: string;
}) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12} xl={6}>
        <Card><Statistic title="公司总数" value={totalTenants} /></Card>
      </Col>
      <Col xs={24} md={12} xl={6}>
        <Card><Statistic title="会话数(当前过滤)" value={sessionTotal} /></Card>
      </Col>
      <Col xs={24} md={12} xl={6}>
        <Card><Statistic title="审计记录" value={auditTotal} /></Card>
      </Col>
      <Col xs={24} md={12} xl={6}>
        <Card><Statistic title="系统状态" value={loading ? "Loading" : "Ready"} /></Card>
      </Col>
      {error ? (
        <Col xs={24}>
          <Card title="错误信息">{error}</Card>
        </Col>
      ) : null}
      {notice ? (
        <Col xs={24}>
          <Card title="通知">{notice}</Card>
        </Col>
      ) : null}
    </Row>
  );
}
