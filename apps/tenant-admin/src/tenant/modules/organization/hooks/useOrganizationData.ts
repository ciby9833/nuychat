/**
 * 菜单路径与名称: 客户中心 -> Organization / 组织架构
 * 文件职责: 负责部门、团队、坐席数据加载，部门筛选，以及团队成员增删动作。
 * 主要交互文件:
 * - ../OrganizationTab.tsx
 * - ../components/DepartmentPanel.tsx
 * - ../components/TeamsPanel.tsx
 * - ../../../api
 */

import { message } from "antd";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addTeamMember,
  deleteDepartment,
  deleteTeam,
  listAgents,
  listDepartments,
  listTeams,
  removeTeamMember
} from "../../../api";
import type { AgentProfile, DepartmentItem, TeamItem } from "../types";

export function useOrganizationData() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentItem | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamItem | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [depts, tms, ags] = await Promise.all([listDepartments(), listTeams(), listAgents()]);
      setDepartments(depts);
      setTeams(tms);
      setAgents(ags);
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visibleTeams = useMemo(
    () => selectedDeptId ? teams.filter((team) => team.departmentId === selectedDeptId) : teams,
    [teams, selectedDeptId]
  );

  const selectedDept = useMemo(
    () => departments.find((department) => department.departmentId === selectedDeptId) ?? null,
    [departments, selectedDeptId]
  );

  const handleRemoveMember = useCallback(async (teamId: string, agentId: string) => {
    try {
      await removeTeamMember(teamId, agentId);
      void message.success(i18next.t("organizationModule.messages.memberRemoved"));
      await reload();
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [reload]);

  const handleAddMember = useCallback(async (teamId: string, agentId: string) => {
    try {
      await addTeamMember(teamId, { agentId, isPrimary: true });
      void message.success(i18next.t("organizationModule.messages.memberAdded"));
      await reload();
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [reload]);

  const handleDeleteDepartment = useCallback(async (department: DepartmentItem) => {
    try {
      await deleteDepartment(department.departmentId);
      if (selectedDeptId === department.departmentId) {
        setSelectedDeptId(null);
      }
      void message.success(i18next.t("organizationModule.messages.departmentDeleted"));
      await reload();
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [reload, selectedDeptId]);

  const handleDeleteTeam = useCallback(async (team: TeamItem) => {
    try {
      await deleteTeam(team.teamId);
      void message.success(i18next.t("organizationModule.messages.teamDeleted"));
      await reload();
    } catch (err) {
      void message.error((err as Error).message);
    }
  }, [reload]);

  return {
    departments,
    teams,
    agents,
    loading,
    selectedDeptId,
    showDeptModal,
    showTeamModal,
    editingDepartment,
    editingTeam,
    visibleTeams,
    selectedDept,
    setSelectedDeptId,
    setShowDeptModal,
    setShowTeamModal,
    setEditingDepartment,
    setEditingTeam,
    reload,
    handleRemoveMember,
    handleAddMember,
    handleDeleteDepartment,
    handleDeleteTeam
  };
}
