import dayjs from "dayjs";
import { Button, DatePicker, Select } from "antd";

import { DATE_PRESET_OPTIONS, SCOPE_OPTIONS } from "../helpers";
import { S } from "../../ai-conversations/styles";
import type { DatePreset, Scope, SupervisorAgentStatus } from "../types";

type HumanConversationsFilterBarProps = {
  loading: boolean;
  selectedScope: Scope;
  selectedAgentId: string;
  agents: SupervisorAgentStatus[];
  datePreset: DatePreset;
  customRange: [dayjs.Dayjs | null, dayjs.Dayjs | null];
  summary: { total: number; waiting: number; resolved: number };
  onScopeChange: (value: Scope) => void;
  onAgentChange: (value: string) => void;
  onDatePresetChange: (value: DatePreset) => void;
  onCustomRangeChange: (value: [dayjs.Dayjs | null, dayjs.Dayjs | null]) => void;
  onRefresh: () => void;
};

export function HumanConversationsFilterBar({
  loading,
  selectedScope,
  selectedAgentId,
  agents,
  datePreset,
  customRange,
  summary,
  onScopeChange,
  onAgentChange,
  onDatePresetChange,
  onCustomRangeChange,
  onRefresh
}: HumanConversationsFilterBarProps) {
  return (
    <div style={S.filterBar}>
      <Select
        size="small"
        style={{ width: 180 }}
        value={selectedScope}
        onChange={(value) => onScopeChange(value as Scope)}
        options={SCOPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />
      <Select
        size="small"
        style={{ width: 220 }}
        value={selectedAgentId}
        onChange={onAgentChange}
        options={[{ value: "all", label: "全部人工坐席" }, ...agents.map((agent) => ({ value: agent.agentId, label: agent.displayName }))]}
      />
      <Select
        size="small"
        style={{ width: 110 }}
        value={datePreset}
        onChange={(value) => onDatePresetChange(value as DatePreset)}
        options={DATE_PRESET_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />
      {datePreset === "custom" ? (
        <DatePicker.RangePicker
          size="small"
          value={customRange}
          onChange={(value) => onCustomRangeChange(value as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
          allowClear={false}
        />
      ) : null}
      <Button size="small" onClick={onRefresh} loading={loading}>刷新</Button>
      <div style={S.filterRight}>
        <span>会话 {summary.total}</span>
        <span style={{ color: "#d48806" }}>待接手 {summary.waiting}</span>
        <span style={{ color: "#52c41a" }}>已解决 {summary.resolved}</span>
      </div>
    </div>
  );
}
