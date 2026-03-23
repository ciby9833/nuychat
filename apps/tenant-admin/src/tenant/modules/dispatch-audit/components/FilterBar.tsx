// 作用: 调度审计筛选栏（统计标签 + 筛选条件 + 日期）
// 菜单路径: 客户中心 -> 调度审计 -> 筛选
// 作者：吴川

import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, DatePicker, Input, Select, Space, Tag, Typography } from "antd";
import type { Dayjs } from "dayjs";

import { DATE_PRESET_OPTIONS, type DatePreset, type RangeValue, TRIGGER_OPTIONS } from "../types";

export function FilterBar({
  stats,
  caseId,
  conversationId,
  triggerType,
  datePreset,
  customRange,
  loading,
  onCaseIdChange,
  onConversationIdChange,
  onTriggerTypeChange,
  onDatePresetChange,
  onCustomRangeChange,
  onRefresh
}: {
  stats: { total: number; ai: number; manual: number };
  caseId: string;
  conversationId: string;
  triggerType: string | undefined;
  datePreset: DatePreset;
  customRange: [Dayjs | null, Dayjs | null] | null;
  loading: boolean;
  onCaseIdChange: (v: string) => void;
  onConversationIdChange: (v: string) => void;
  onTriggerTypeChange: (v: string | undefined) => void;
  onDatePresetChange: (v: DatePreset) => void;
  onCustomRangeChange: (v: RangeValue) => void;
  onRefresh: () => void;
}) {
  return (
    <Card title="调度依据">
      <Space wrap>
        <Tag color="blue">{stats.total} 条执行记录</Tag>
        <Tag color="purple">{stats.ai} 条 AI 选择</Tag>
        <Tag color="green">{stats.manual} 条人工变更</Tag>
        <Input
          allowClear
          placeholder="按事项 ID 过滤"
          value={caseId}
          onChange={(event) => onCaseIdChange(event.target.value)}
          style={{ width: 220 }}
        />
        <Input
          allowClear
          placeholder="按会话 ID 过滤"
          value={conversationId}
          onChange={(event) => onConversationIdChange(event.target.value)}
          style={{ width: 240 }}
        />
        <Select
          allowClear
          placeholder="触发类型"
          value={triggerType}
          onChange={onTriggerTypeChange}
          options={TRIGGER_OPTIONS}
          style={{ width: 180 }}
        />
        <Select
          value={datePreset}
          onChange={(value) => onDatePresetChange(value)}
          options={DATE_PRESET_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          style={{ width: 140 }}
        />
        {datePreset === "custom" ? (
          <DatePicker.RangePicker
            value={customRange}
            onChange={(values) => onCustomRangeChange(values)}
            allowEmpty={[false, false]}
          />
        ) : null}
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
          刷新
        </Button>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        用于查看每个事项为什么被分配到 AI 或人工，以及后续每次转移的依据。
      </Typography.Paragraph>
    </Card>
  );
}
