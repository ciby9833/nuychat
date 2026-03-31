/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理
 * 文件职责: 负责加载班次模板、排班记录、在线状态、组织结构，并维护周/月视图与当前页签状态。
 * 主要交互文件:
 * - ../ShiftsTab.tsx: 消费当前页签、加载状态与刷新动作。
 * - ../components/SchedulePane.tsx: 消费排班数据、组织结构和日期切换能力。
 * - ../components/ShiftDefinitionsPane.tsx: 消费班次模板列表与刷新动作。
 * - ../components/PresencePane.tsx: 消费在线状态与刷新动作。
 * - ../../../api.ts: 提供排班模块所需接口。
 */

import { message } from "antd";
import dayjs from "dayjs";
import i18next from "i18next";
import isoWeek from "dayjs/plugin/isoWeek";
import { useCallback, useEffect, useState } from "react";

import {
  getAgentPresence,
  listAgentShifts,
  listAgents,
  listDepartments,
  listShiftSchedules,
  listTeams
} from "../../../api";
import type { AgentPresenceResponse, AgentProfile, AgentShiftItem, DepartmentItem, ShiftScheduleItem, TeamItem } from "../types";

dayjs.extend(isoWeek);

export function useShiftsData() {
  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState<ShiftScheduleItem[]>([]);
  const [agentShifts, setAgentShifts] = useState<AgentShiftItem[]>([]);
  const [presence, setPresence] = useState<AgentPresenceResponse | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [activeTab, setActiveTab] = useState("schedule");
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [fromDate, setFromDate] = useState(() => dayjs().isoWeekday(1).format("YYYY-MM-DD"));

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const from = viewMode === "month" ? dayjs(fromDate).startOf("month").format("YYYY-MM-DD") : fromDate;
      const to = viewMode === "month" ? dayjs(fromDate).endOf("month").format("YYYY-MM-DD") : dayjs(fromDate).add(6, "day").format("YYYY-MM-DD");
      const [schedulesData, presenceData, agentsData, shiftsData] = await Promise.all([
        listShiftSchedules(),
        getAgentPresence(),
        listAgents(),
        listAgentShifts({ from, to })
      ]);
      setSchedules(schedulesData);
      setPresence(presenceData);
      setAgents(agentsData);
      setAgentShifts(shiftsData);
    } catch (err) {
      void message.error(`${i18next.t("shiftsModule.messages.loadFailed")}: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [fromDate, viewMode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void Promise.all([listDepartments(), listTeams()])
      .then(([deps, tms]) => {
        setDepartments(deps);
        setTeams(tms);
      })
      .catch(() => {});
  }, []);

  const handleChangeViewMode = (mode: "week" | "month") => {
    if (mode === "month") {
      setFromDate(dayjs(fromDate).startOf("month").format("YYYY-MM-DD"));
    } else {
      setFromDate(dayjs(fromDate).isoWeekday(1).format("YYYY-MM-DD"));
    }
    setViewMode(mode);
  };

  return {
    loading,
    schedules,
    agentShifts,
    presence,
    agents,
    departments,
    teams,
    activeTab,
    viewMode,
    fromDate,
    setActiveTab,
    setFromDate,
    reload,
    handleChangeViewMode
  };
}
