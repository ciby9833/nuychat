import { Button, Card, DatePicker, Select, Space } from "antd";
import dayjs from "dayjs";

import type { ResponseFilter, SurveyFilter } from "../types";

type CsatSurveyFilterBarProps = {
  loading: boolean;
  surveyFilter: SurveyFilter;
  responseFilter: ResponseFilter;
  onSurveyFilterChange: (updater: (prev: SurveyFilter) => SurveyFilter) => void;
  onRefresh: () => void;
};

export function CsatSurveyFilterBar({
  loading,
  surveyFilter,
  responseFilter,
  onSurveyFilterChange,
  onRefresh
}: CsatSurveyFilterBarProps) {
  return (
    <Card
      title="调查任务查询"
      extra={<Button onClick={onRefresh}>刷新</Button>}
    >
      <Space wrap>
        <Select
          allowClear
          style={{ width: 180 }}
          placeholder="调查状态"
          value={surveyFilter.status}
          onChange={(value) => onSurveyFilterChange((prev) => ({ ...prev, status: value }))}
          options={[
            { value: "scheduled", label: "待发送" },
            { value: "sent", label: "已发送" },
            { value: "responded", label: "已响应" },
            { value: "expired", label: "已过期" },
            { value: "failed", label: "发送失败" }
          ]}
        />
        <DatePicker
          value={surveyFilter.from ? dayjs(surveyFilter.from) : null}
          onChange={(value) => onSurveyFilterChange((prev) => ({ ...prev, from: value ? value.format("YYYY-MM-DD") : undefined }))}
        />
        <DatePicker
          value={surveyFilter.to ? dayjs(surveyFilter.to) : null}
          onChange={(value) => onSurveyFilterChange((prev) => ({ ...prev, to: value ? value.format("YYYY-MM-DD") : undefined }))}
        />
        <Button type="primary" onClick={onRefresh} loading={loading}>查询</Button>
      </Space>
    </Card>
  );
}
