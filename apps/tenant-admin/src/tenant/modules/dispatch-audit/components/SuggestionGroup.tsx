// 作用: 调度运营建议分组卡片
// 菜单路径: 客户中心 -> 调度审计 -> 运营建议
// 作者：吴川

import { Card, Space, Tag, Typography } from "antd";

import type { DispatchOpsSuggestion } from "../../../types";

export function SuggestionGroup({ title, items }: { title: string; items: DispatchOpsSuggestion[] }) {
  if (items.length === 0) {
    return (
      <Card size="small" title={title}>
        <Typography.Text type="secondary">当前时间范围内暂无明显建议。</Typography.Text>
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
                  {item.severity === "high" ? "高" : item.severity === "medium" ? "中" : "低"}
                </Tag>
                <span>{item.title}</span>
              </Space>
            )}
          >
            <Typography.Paragraph style={{ marginBottom: 8 }}>{item.summary}</Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              建议：{item.recommendation}
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
