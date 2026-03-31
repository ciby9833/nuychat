/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理 -> 排班表
 * 文件职责: 展示周/月排班表、筛选条件、批量排班入口，以及复制排班到下一周期操作。
 * 主要交互文件:
 * - ../hooks/useShiftsData.ts: 提供坐席、班次、组织结构与日期切换数据。
 * - ../helpers.ts: 提供日期生成、星期文案、状态标签与日期判断逻辑。
 * - ./ShiftCellPopover.tsx: 负责单格排班设置。
 * - ../modals/BulkScheduleModal.tsx: 负责批量排班。
 */

import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  TeamOutlined
} from "@ant-design/icons";
import { Button, Input, Popconfirm, Radio, Select, Space, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { bulkUpsertAgentShifts } from "../../../api";
import { buildShiftIndex, getDayShort, getShiftStatusTagMap, monthDays, weekDays } from "../helpers";
import { BulkScheduleModal } from "../modals/BulkScheduleModal";
import type { AgentProfile, AgentShiftItem, DepartmentItem, ShiftScheduleItem, TeamItem } from "../types";
import { ShiftCellPopover } from "./ShiftCellPopover";

type SchedulePaneProps = {
  agents: AgentProfile[];
  agentShifts: AgentShiftItem[];
  schedules: ShiftScheduleItem[];
  departments: DepartmentItem[];
  teams: TeamItem[];
  fromDate: string;
  viewMode: "week" | "month";
  loading: boolean;
  onChangeDate: (date: string) => void;
  onChangeViewMode: (mode: "week" | "month") => void;
  onReload: () => Promise<void>;
};

export function SchedulePane({
  agents,
  agentShifts,
  schedules,
  departments,
  teams,
  fromDate,
  viewMode,
  loading,
  onChangeDate,
  onChangeViewMode,
  onReload
}: SchedulePaneProps) {
  const { t } = useTranslation();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDeptId, setFilterDeptId] = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null);

  const handleDeptChange = (value: string | null) => {
    setFilterDeptId(value);
    setFilterTeamId(null);
  };

  const days = useMemo(() => viewMode === "week" ? weekDays(fromDate) : monthDays(fromDate), [fromDate, viewMode]);
  const today = dayjs().format("YYYY-MM-DD");
  const dayShort = getDayShort();
  const shiftStatusTagMap = getShiftStatusTagMap();

  const teamOptions = useMemo(
    () => teams.filter((team) => team.isActive && (!filterDeptId || team.departmentId === filterDeptId)).map((team) => ({ value: team.teamId, label: team.name })),
    [teams, filterDeptId]
  );

  const agentIdsByDept = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const team of teams) {
      if (!team.departmentId) continue;
      if (!map.has(team.departmentId)) map.set(team.departmentId, new Set());
      for (const member of team.members) map.get(team.departmentId)?.add(member.agentId);
    }
    return map;
  }, [teams]);

  const agentIdsByTeam = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const team of teams) {
      map.set(team.teamId, new Set(team.members.map((member) => member.agentId)));
    }
    return map;
  }, [teams]);

  const filteredAgents = useMemo(() => {
    let list = agents;
    if (filterTeamId) {
      const ids = agentIdsByTeam.get(filterTeamId);
      if (ids) list = list.filter((agent) => ids.has(agent.agentId));
    } else if (filterDeptId) {
      const ids = agentIdsByDept.get(filterDeptId);
      if (ids) list = list.filter((agent) => ids.has(agent.agentId));
    }
    if (filterSearch.trim()) {
      const query = filterSearch.trim().toLowerCase();
      list = list.filter((agent) => agent.displayName.toLowerCase().includes(query) || agent.email.toLowerCase().includes(query));
    }
    return list;
  }, [agents, filterDeptId, filterTeamId, filterSearch, agentIdsByDept, agentIdsByTeam]);

  useEffect(() => {
    setSelectedRowKeys([]);
  }, [filteredAgents]);

  const shiftIndex = useMemo(() => buildShiftIndex(agentShifts), [agentShifts]);

  const isWeek = viewMode === "week";
  const prevDate = isWeek ? dayjs(fromDate).subtract(7, "day").format("YYYY-MM-DD") : dayjs(fromDate).subtract(1, "month").startOf("month").format("YYYY-MM-DD");
  const nextDate = isWeek ? dayjs(fromDate).add(7, "day").format("YYYY-MM-DD") : dayjs(fromDate).add(1, "month").startOf("month").format("YYYY-MM-DD");
  const resetDate = isWeek ? dayjs().isoWeekday(1).format("YYYY-MM-DD") : dayjs().startOf("month").format("YYYY-MM-DD");
  const periodLabel = isWeek ? `${dayjs(days[0]).format("MMM D")} - ${dayjs(days[days.length - 1]).format("MMM D")}` : dayjs(fromDate).format("YYYY MMM");

  const handleCopyToNext = async () => {
    if (agentShifts.length === 0) {
      void message.info(t("shiftsModule.schedule.copySourceEmpty"));
      return;
    }
    const offset = isWeek ? { value: 7, unit: "day" as const } : { value: 1, unit: "month" as const };
    try {
      const items = agentShifts.map((shift) => ({
        agentId: shift.agentId,
        shiftId: shift.shiftId ?? undefined,
        shiftDate: dayjs(shift.shiftDate).add(offset.value, offset.unit).format("YYYY-MM-DD"),
        status: shift.status
      }));
      const result = await bulkUpsertAgentShifts(items);
      void message.success(t(isWeek ? "shiftsModule.schedule.copySuccessWeek" : "shiftsModule.schedule.copySuccessMonth", { count: result.saved }));
      onChangeDate(nextDate);
    } catch (err) {
      void message.error((err as Error).message);
    }
  };

  const cellWidth = isWeek ? 90 : 40;
  const columns = [
    {
      title: (
        <Space>
          <Typography.Text strong style={{ fontSize: 13 }}>{t("shiftsModule.schedule.agent")}</Typography.Text>
          {selectedRowKeys.length > 0 ? <Tag color="blue">{t("shiftsModule.schedule.selectedCount", { count: selectedRowKeys.length })}</Tag> : null}
        </Space>
      ),
      key: "agent",
      width: 160,
      fixed: "left" as const,
      render: (_: unknown, agent: AgentProfile) => (
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>{agent.displayName}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: "block" }}>{agent.email}</Typography.Text>
        </div>
      )
    },
    ...days.map((date) => {
      const dow = dayjs(date).isoWeekday();
      const weekend = dow >= 6;
      const isToday = date === today;
      const weekendBg = weekend ? "#fffbe6" : undefined;

      return {
        title: (
          <div style={{ textAlign: "center", lineHeight: 1.3 }}>
            <div style={{ fontSize: 10, color: weekend ? "#fa8c16" : "#8c8c8c" }}>{dayShort[dow - 1]}</div>
            <div style={{ fontSize: isWeek ? 13 : 11, fontWeight: isToday ? 700 : 400, color: isToday ? "#1677ff" : weekend ? "#fa8c16" : undefined, background: isToday ? "#e6f4ff" : "transparent", borderRadius: 4, padding: "0 2px" }}>
              {isWeek ? dayjs(date).format("M/D") : dayjs(date).date()}
            </div>
          </div>
        ),
        key: date,
        width: cellWidth,
        onHeaderCell: () => ({ style: { background: weekendBg, padding: isWeek ? undefined : "4px 2px" } }),
        onCell: () => ({ style: { background: weekendBg, padding: isWeek ? undefined : "2px 2px" } }),
        render: (_: unknown, agent: AgentProfile) => (
          <ShiftCellPopover
            agentId={agent.agentId}
            date={date}
            currentShift={shiftIndex.get(agent.agentId)?.get(date)}
            schedules={schedules}
            onSaved={onReload}
            compact={!isWeek}
          />
        )
      };
    })
  ];

  const deptOptions = departments.filter((department) => department.isActive).map((department) => ({ value: department.departmentId, label: department.name }));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Radio.Group size="small" value={viewMode} onChange={(event) => onChangeViewMode(event.target.value as "week" | "month")} optionType="button" buttonStyle="solid">
            <Radio.Button value="week"><ClockCircleOutlined /> {t("shiftsModule.schedule.week")}</Radio.Button>
            <Radio.Button value="month"><CalendarOutlined /> {t("shiftsModule.schedule.month")}</Radio.Button>
          </Radio.Group>

          <Button icon={<ArrowLeftOutlined />} size="small" onClick={() => onChangeDate(prevDate)}>{t(isWeek ? "shiftsModule.schedule.previousWeek" : "shiftsModule.schedule.previousMonth")}</Button>
          <Typography.Text strong style={{ minWidth: 140, textAlign: "center" }}>{periodLabel}</Typography.Text>
          <Button icon={<ArrowRightOutlined />} size="small" onClick={() => onChangeDate(nextDate)}>{t(isWeek ? "shiftsModule.schedule.nextWeek" : "shiftsModule.schedule.nextMonth")}</Button>
          <Button size="small" type={fromDate === resetDate ? "primary" : "default"} onClick={() => onChangeDate(resetDate)}>{t(isWeek ? "shiftsModule.schedule.thisWeek" : "shiftsModule.schedule.thisMonth")}</Button>
          <Popconfirm
            title={t(isWeek ? "shiftsModule.schedule.copyConfirmTitleWeek" : "shiftsModule.schedule.copyConfirmTitleMonth")}
            description={t(isWeek ? "shiftsModule.schedule.copyConfirmDescriptionWeek" : "shiftsModule.schedule.copyConfirmDescriptionMonth")}
            onConfirm={() => { void handleCopyToNext(); }}
            okText={t("shiftsModule.schedule.copyConfirmOk")}
            cancelText={t("common.cancel")}
          >
            <Button size="small">{t(isWeek ? "shiftsModule.schedule.copyToNextWeek" : "shiftsModule.schedule.copyToNextMonth")}</Button>
          </Popconfirm>
        </Space>

        <Space size={8}>
          {Object.entries(shiftStatusTagMap).map(([key, value]) => (
            <Space key={key} size={4}>
              <span style={{ width: 10, height: 10, background: value.bg, border: `1px solid ${value.dot}80`, borderRadius: 2, display: "inline-block" }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{value.label}</Typography.Text>
            </Space>
          ))}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>- {t("shiftsModule.schedule.unset")}</Typography.Text>
        </Space>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Input size="small" allowClear prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />} placeholder={t("shiftsModule.schedule.searchPlaceholder")} style={{ width: 180 }} value={filterSearch} onChange={(event) => setFilterSearch(event.target.value)} />
          <Select size="small" allowClear placeholder={t("shiftsModule.schedule.departmentPlaceholder")} style={{ width: 140 }} value={filterDeptId} onChange={handleDeptChange} options={deptOptions} suffixIcon={<TeamOutlined />} />
          <Select size="small" allowClear placeholder={t("shiftsModule.schedule.teamPlaceholder")} style={{ width: 140 }} value={filterTeamId} onChange={(value) => setFilterTeamId(value ?? null)} options={teamOptions} disabled={teamOptions.length === 0} suffixIcon={<TeamOutlined />} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("shiftsModule.schedule.summary", { visible: filteredAgents.length, total: agents.length })}</Typography.Text>
        </Space>

        <Space>
          {selectedRowKeys.length > 0 ? <Button type="primary" size="small" icon={<CheckSquareOutlined />} onClick={() => setBulkModalOpen(true)}>{t("shiftsModule.schedule.bulkApply", { count: selectedRowKeys.length })}</Button> : null}
          {selectedRowKeys.length > 0 ? <Button size="small" onClick={() => setSelectedRowKeys([])}>{t("shiftsModule.schedule.clearSelection")}</Button> : null}
          {filteredAgents.length > 0 && selectedRowKeys.length === 0 ? <Button size="small" onClick={() => setSelectedRowKeys(filteredAgents.map((agent) => agent.agentId))}>{t("shiftsModule.schedule.selectAllCurrent", { count: filteredAgents.length })}</Button> : null}
        </Space>
      </div>

      <Table<AgentProfile>
        rowKey="agentId"
        loading={loading}
        dataSource={filteredAgents}
        columns={columns}
        pagination={false}
        scroll={{ x: 160 + cellWidth * days.length }}
        locale={{ emptyText: t("shiftsModule.schedule.noAgents") }}
        size="small"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys, columnWidth: 40 }}
      />

      <BulkScheduleModal
        open={bulkModalOpen}
        agents={filteredAgents}
        selectedAgentIds={selectedRowKeys as string[]}
        schedules={schedules}
        allDates={days}
        viewMode={viewMode}
        onClose={() => setBulkModalOpen(false)}
        onSaved={onReload}
      />
    </>
  );
}
