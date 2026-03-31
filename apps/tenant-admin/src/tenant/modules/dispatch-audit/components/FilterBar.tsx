/**
 * 菜单路径与名称: 客户中心 -> 调度审计 -> 筛选栏
 * 文件职责: 展示统计摘要、查询条件与日期范围切换，并驱动主页面数据刷新。
 * 主要交互文件:
 * - ../DispatchAuditTab.tsx
 * - ../types.ts
 * - ../helpers.tsx
 * - ../hooks/useDispatchAuditData.ts
 */

import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, DatePicker, Input, Select, Space, Tag, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";

import { DATE_PRESET_OPTIONS, type DatePreset, type RangeValue, TRIGGER_OPTIONS } from "../types";
import { formatTriggerType } from "../helpers";

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
  stats: { total: number; plans: number; aiRuntime: number; manual: number };
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
  const { t } = useTranslation();

  return (
    <Card title={t("tabs.dispatch-audit")}>
      <Space wrap>
        <Tag color="blue">{t("dispatchAudit.stats.total", { count: stats.total })}</Tag>
        <Tag color="cyan">{t("dispatchAudit.stats.plans", { count: stats.plans })}</Tag>
        <Tag color="purple">{t("dispatchAudit.stats.aiRuntime", { count: stats.aiRuntime })}</Tag>
        <Tag color="green">{t("dispatchAudit.stats.manual", { count: stats.manual })}</Tag>
        <Input
          allowClear
          placeholder={t("dispatchAudit.filters.caseId")}
          value={caseId}
          onChange={(event) => onCaseIdChange(event.target.value)}
          style={{ width: 220 }}
        />
        <Input
          allowClear
          placeholder={t("dispatchAudit.filters.conversationId")}
          value={conversationId}
          onChange={(event) => onConversationIdChange(event.target.value)}
          style={{ width: 240 }}
        />
        <Select
          allowClear
          placeholder={t("dispatchAudit.filters.triggerType")}
          value={triggerType}
          onChange={onTriggerTypeChange}
          options={TRIGGER_OPTIONS.map((item) => ({ value: item.value, label: formatTriggerType(t, item.label) }))}
          style={{ width: 180 }}
        />
        <Select
          value={datePreset}
          onChange={(value) => onDatePresetChange(value)}
          options={DATE_PRESET_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
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
          {t("common.refresh")}
        </Button>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        {t("dispatchAudit.hint")}
      </Typography.Paragraph>
    </Card>
  );
}
