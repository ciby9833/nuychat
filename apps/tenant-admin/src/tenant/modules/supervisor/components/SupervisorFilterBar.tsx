/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台 -> 组织筛选
 * 文件职责: 提供部门、团队、坐席与范围筛选条件。
 * 主要交互文件:
 * - ../SupervisorTab.tsx: 负责承接筛选状态变更与应用动作。
 * - ../hooks/useSupervisorData.ts: 提供部门、团队、坐席数据源。
 */

import { Button, Card, Select, Space } from "antd";
import { useTranslation } from "react-i18next";

import type { DepartmentItem, SupervisorAgentStatus, SupervisorScopeFilter, TeamItem } from "../types";

type SupervisorFilterBarProps = {
  loading: boolean;
  departments: DepartmentItem[];
  teams: TeamItem[];
  agents: SupervisorAgentStatus[];
  departmentFilter?: string;
  teamFilter?: string;
  agentFilter?: string;
  scopeFilter: SupervisorScopeFilter;
  onDepartmentChange: (value: string | undefined) => void;
  onTeamChange: (value: string | undefined) => void;
  onAgentChange: (value: string | undefined) => void;
  onScopeChange: (value: SupervisorScopeFilter) => void;
  onApply: () => void;
};

export function SupervisorFilterBar({
  loading,
  departments,
  teams,
  agents,
  departmentFilter,
  teamFilter,
  agentFilter,
  scopeFilter,
  onDepartmentChange,
  onTeamChange,
  onAgentChange,
  onScopeChange,
  onApply
}: SupervisorFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("supervisorModule.filter.title")}>
      <Space wrap>
        <Select
          allowClear
          placeholder={t("supervisorModule.filter.department")}
          style={{ width: 180 }}
          value={departmentFilter}
          onChange={onDepartmentChange}
          options={departments.map((item) => ({ value: item.departmentId, label: item.name }))}
        />
        <Select
          allowClear
          placeholder={t("supervisorModule.filter.team")}
          style={{ width: 180 }}
          value={teamFilter}
          onChange={onTeamChange}
          options={teams.map((item) => ({ value: item.teamId, label: item.name }))}
        />
        <Select
          allowClear
          showSearch
          placeholder={t("supervisorModule.filter.agent")}
          style={{ width: 200 }}
          value={agentFilter}
          onChange={onAgentChange}
          options={agents.map((item) => ({ value: item.agentId, label: item.displayName }))}
        />
        <Select
          style={{ width: 180 }}
          value={scopeFilter}
          onChange={onScopeChange}
          options={[
            { value: "all", label: t("supervisorModule.filter.scopeAll") },
            { value: "waiting", label: t("supervisorModule.filter.scopeWaiting") },
            { value: "exception", label: t("supervisorModule.filter.scopeException") },
            { value: "active", label: t("supervisorModule.filter.scopeActive") },
            { value: "resolved", label: t("supervisorModule.filter.scopeResolved") }
          ]}
        />
        <Button onClick={onApply} loading={loading}>{t("supervisorModule.filter.apply")}</Button>
      </Space>
    </Card>
  );
}
