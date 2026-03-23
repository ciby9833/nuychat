// 作用: AI 会话监控顶部筛选栏（AI座席、状态、日期筛选 + 统计摘要）
// 菜单路径: 客户中心 -> AI 会话监控 -> 筛选栏
// 作者：吴川

import { Button, DatePicker, Select } from "antd";

import type { TenantAIAgent } from "../../../types";
import { S } from "../styles";
import type { DatePreset, RangeValue } from "../types";
import { DATE_PRESET_OPTIONS, STATUS_OPTIONS } from "../types";

export function FilterBar({
  aiAgents,
  selectedAiAgentId,
  onAiAgentChange,
  selectedStatus,
  onStatusChange,
  datePreset,
  onDatePresetChange,
  customRange,
  onCustomRangeChange,
  summary,
  loading,
  onRefresh
}: {
  aiAgents: TenantAIAgent[];
  selectedAiAgentId: string;
  onAiAgentChange: (v: string) => void;
  selectedStatus: string;
  onStatusChange: (v: string) => void;
  datePreset: DatePreset;
  onDatePresetChange: (v: DatePreset) => void;
  customRange: RangeValue;
  onCustomRangeChange: (v: RangeValue) => void;
  summary: { total: number; handoff: number; transferred: number };
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div style={S.filterBar}>
      <Select size="small" style={{ width: 200 }} value={selectedAiAgentId} onChange={onAiAgentChange}
        options={[{ value: "all", label: "全部 AI 座席" }, ...aiAgents.map((a) => ({ value: a.aiAgentId, label: a.name }))]}
      />
      <Select size="small" style={{ width: 140 }} value={selectedStatus} onChange={onStatusChange} options={STATUS_OPTIONS} />
      <Select size="small" style={{ width: 110 }} value={datePreset} onChange={(v) => onDatePresetChange(v as DatePreset)}
        options={DATE_PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />
      {datePreset === "custom" ? (
        <DatePicker.RangePicker size="small" value={customRange} onChange={(v) => onCustomRangeChange(v)} allowClear={false} />
      ) : null}
      <Button size="small" onClick={onRefresh} loading={loading}>刷新</Button>
      <div style={S.filterRight}>
        <span>会话 {summary.total}</span>
        <span style={{ color: "#faad14" }}>待转 {summary.handoff}</span>
        <span style={{ color: "#1677ff" }}>已转 {summary.transferred}</span>
      </div>
    </div>
  );
}
