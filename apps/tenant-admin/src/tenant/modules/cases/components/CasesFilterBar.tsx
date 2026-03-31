/**
 * 菜单路径与名称: 客户中心 -> Cases / 会话事项 -> 筛选栏
 * 文件职责: 提供事项搜索、状态筛选与查询动作。
 * 主要交互文件:
 * - ../CasesTab.tsx
 * - ../types.ts
 * - ../../../../i18n/locales/en/modules/cases.ts
 * - ../../../../i18n/locales/zh/modules/cases.ts
 * - ../../../../i18n/locales/id/modules/cases.ts
 */

import { Button, Card, Input, Select, Space } from "antd";
import { useTranslation } from "react-i18next";

type CasesFilterBarProps = {
  loading: boolean;
  search: string;
  status?: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string | undefined) => void;
  onSubmit: () => void;
};

const STATUS_OPTIONS = [
  { value: "open", labelKey: "cases.statusOptions.open" },
  { value: "in_progress", labelKey: "cases.statusOptions.in_progress" },
  { value: "waiting_customer", labelKey: "cases.statusOptions.waiting_customer" },
  { value: "waiting_internal", labelKey: "cases.statusOptions.waiting_internal" },
  { value: "resolved", labelKey: "cases.statusOptions.resolved" },
  { value: "closed", labelKey: "cases.statusOptions.closed" }
];

export function CasesFilterBar({
  loading,
  search,
  status,
  onSearchChange,
  onStatusChange,
  onSubmit
}: CasesFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <Space wrap>
        <Input.Search
          allowClear
          style={{ width: 280 }}
          placeholder={t("cases.searchPlaceholder")}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onSearch={onSubmit}
        />
        <Select
          allowClear
          style={{ width: 180 }}
          placeholder={t("cases.statusPlaceholder")}
          value={status}
          onChange={onStatusChange}
          options={STATUS_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
        />
        <Button type="primary" onClick={onSubmit} loading={loading}>
          {t("cases.query")}
        </Button>
      </Space>
    </Card>
  );
}
