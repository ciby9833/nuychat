import { Button, Card, DatePicker, InputNumber, Select, Space } from "antd";
import dayjs from "dayjs";

import type { AgentProfile, ResponseFilter } from "../types";

type CsatResponseFilterBarProps = {
  loading: boolean;
  agents: AgentProfile[];
  responseFilter: ResponseFilter;
  onResponseFilterChange: (updater: (prev: ResponseFilter) => ResponseFilter) => void;
  onSubmit: () => void;
};

export function CsatResponseFilterBar({
  loading,
  agents,
  responseFilter,
  onResponseFilterChange,
  onSubmit
}: CsatResponseFilterBarProps) {
  return (
    <Card title="满意度结果查询">
      <Space wrap>
        <Select
          allowClear
          style={{ width: 220 }}
          placeholder="按坐席筛选"
          value={responseFilter.agentId}
          onChange={(value) => onResponseFilterChange((prev) => ({ ...prev, agentId: value }))}
          options={agents.map((agent) => ({ value: agent.agentId, label: `${agent.displayName} (${agent.email})` }))}
        />
        <InputNumber
          min={1}
          max={5}
          style={{ width: 120 }}
          placeholder="最低评分"
          value={responseFilter.minRating}
          onChange={(value) => onResponseFilterChange((prev) => ({ ...prev, minRating: typeof value === "number" ? value : undefined }))}
        />
        <InputNumber
          min={1}
          max={5}
          style={{ width: 120 }}
          placeholder="最高评分"
          value={responseFilter.maxRating}
          onChange={(value) => onResponseFilterChange((prev) => ({ ...prev, maxRating: typeof value === "number" ? value : undefined }))}
        />
        <DatePicker
          value={responseFilter.from ? dayjs(responseFilter.from) : null}
          onChange={(value) => onResponseFilterChange((prev) => ({ ...prev, from: value ? value.format("YYYY-MM-DD") : undefined }))}
        />
        <DatePicker
          value={responseFilter.to ? dayjs(responseFilter.to) : null}
          onChange={(value) => onResponseFilterChange((prev) => ({ ...prev, to: value ? value.format("YYYY-MM-DD") : undefined }))}
        />
        <Button type="primary" onClick={onSubmit} loading={loading}>查询</Button>
      </Space>
    </Card>
  );
}
