// 作用: 调度审计辅助渲染函数（摘要、候选详情）
// 菜单路径: 客户中心 -> 调度审计
// 作者：吴川

import { Space, Tag, Typography } from "antd";

export function renderSummary(summary: Record<string, unknown>) {
  const entries = Object.entries(summary);
  if (entries.length === 0) return <Typography.Text type="secondary">无</Typography.Text>;
  return (
    <Space direction="vertical" size={4}>
      {entries.map(([key, value]) => (
        <Typography.Text key={key} style={{ fontSize: 12 }}>
          <b>{key}</b>: {typeof value === "object" ? JSON.stringify(value) : String(value)}
        </Typography.Text>
      ))}
    </Space>
  );
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

export function renderCandidateDetails(details: Record<string, unknown>) {
  const todayNewCaseCount = readNumber(details.todayNewCaseCount);
  const activeAssignments = readNumber(details.activeAssignments);
  const reservedAssignments = readNumber(details.reservedAssignments);
  const hasBalancedNewCaseMetrics =
    todayNewCaseCount !== null &&
    activeAssignments !== null &&
    reservedAssignments !== null;

  if (!hasBalancedNewCaseMetrics) {
    return renderSummary(details);
  }

  const score = (4 * todayNewCaseCount) + (2 * activeAssignments) + reservedAssignments;

  return (
    <Space direction="vertical" size={4}>
      <Space wrap>
        <Tag color="blue">score: {score}</Tag>
        <Tag>todayNewCaseCount: {todayNewCaseCount}</Tag>
        <Tag>activeAssignments: {activeAssignments}</Tag>
        <Tag>reservedAssignments: {reservedAssignments}</Tag>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        `balanced_new_case = 4 * 今日新事项 + 2 * 当前接待中 + 1 * 已保留`
      </Typography.Text>
      {renderSummary(details)}
    </Space>
  );
}
