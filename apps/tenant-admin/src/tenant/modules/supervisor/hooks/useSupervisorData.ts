/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台
 * 文件职责: 负责主管工作台概览、会话、坐席、部门团队数据加载，以及筛选与广播弹窗状态管理。
 * 主要交互文件:
 * - ../SupervisorTab.tsx
 * - ../components/SupervisorSummaryCards.tsx
 * - ../components/SupervisorFilterBar.tsx
 * - ../components/SupervisorConversationsTable.tsx
 * - ../components/SupervisorAgentsTable.tsx
 * - ../modals/SupervisorBroadcastModal.tsx
 * - ../../../api
 */

import { message } from "antd";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";

import {
  getSupervisorOverview,
  listDepartments,
  listSupervisorAgents,
  listSupervisorConversations,
  listTeams
} from "../../../api";
import type {
  DepartmentItem,
  SupervisorAgentStatus,
  SupervisorConversationWorkbenchResponse,
  SupervisorOverview,
  SupervisorScopeFilter,
  TeamItem
} from "../types";

export function useSupervisorData() {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<SupervisorOverview | null>(null);
  const [conversations, setConversations] = useState<SupervisorConversationWorkbenchResponse | null>(null);
  const [agents, setAgents] = useState<SupervisorAgentStatus[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>(undefined);
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);
  const [agentFilter, setAgentFilter] = useState<string | undefined>(undefined);
  const [scopeFilter, setScopeFilter] = useState<SupervisorScopeFilter>("all");
  const [page, setPage] = useState(1);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, agentRows, departmentRows, teamRows, conversationRows] = await Promise.all([
        getSupervisorOverview(),
        listSupervisorAgents(),
        listDepartments(),
        listTeams(departmentFilter),
        listSupervisorConversations({
          departmentId: departmentFilter,
          teamId: teamFilter,
          agentId: agentFilter,
          scope: scopeFilter,
          page,
          pageSize: 20
        })
      ]);
      setOverview(ov);
      setAgents(agentRows);
      setDepartments(departmentRows);
      setTeams(teamRows);
      setConversations(conversationRows);
    } catch (err) {
      void message.error(i18next.t("supervisorModule.messages.loadFailed", { message: (err as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [agentFilter, departmentFilter, page, scopeFilter, teamFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  return {
    loading,
    overview,
    conversations,
    agents,
    departments,
    teams,
    departmentFilter,
    teamFilter,
    agentFilter,
    scopeFilter,
    page,
    broadcastOpen,
    broadcastText,
    saving,
    setDepartmentFilter,
    setTeamFilter,
    setAgentFilter,
    setScopeFilter,
    setPage,
    setBroadcastOpen,
    setBroadcastText,
    setSaving,
    load
  };
}
