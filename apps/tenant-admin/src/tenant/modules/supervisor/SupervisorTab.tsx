/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台
 * 文件职责: 主管工作台模块主入口，负责串联监控概览、组织筛选、会话监控、坐席状态与广播通知弹窗。
 * 主要交互文件:
 * - ./hooks/useSupervisorData.ts: 负责概览、会话、坐席、组织数据加载，以及筛选与广播状态管理。
 * - ./components/SupervisorSummaryCards.tsx: 展示主管工作台顶部监控指标与快捷操作。
 * - ./components/SupervisorFilterBar.tsx: 展示部门、团队、坐席、范围筛选栏。
 * - ./components/SupervisorConversationsTable.tsx: 展示主管关注的会话监控列表。
 * - ./components/SupervisorAgentsTable.tsx: 展示当前坐席在线状态与活跃度。
 * - ./modals/SupervisorBroadcastModal.tsx: 承载广播通知输入与确认弹窗。
 * - ../../api.ts: 提供主管概览、会话列表、坐席状态、组织列表与广播接口能力。
 * - ../human-conversations/HumanConversationsTab.tsx: 承接主管工作台跳转后的具体会话处理动作。
 */

import { App, Space } from "antd";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { broadcastToOnlineAgents } from "../../api";
import { SupervisorAgentsTable } from "./components/SupervisorAgentsTable";
import { SupervisorConversationsTable } from "./components/SupervisorConversationsTable";
import { SupervisorFilterBar } from "./components/SupervisorFilterBar";
import { SupervisorSummaryCards } from "./components/SupervisorSummaryCards";
import { useSupervisorData } from "./hooks/useSupervisorData";
import { SupervisorBroadcastModal } from "./modals/SupervisorBroadcastModal";
import type { SupervisorConversationWorkbenchItem } from "./types";

export function SupervisorTab() {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const data = useSupervisorData();

  const openHumanConversations = useCallback((row: SupervisorConversationWorkbenchItem) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("tenant-admin.human-conversations.intent", JSON.stringify({
      conversationId: row.conversationId,
      scope: row.conversationStatus === "resolved" || row.conversationStatus === "closed" ? "resolved" : "all"
    }));
    window.dispatchEvent(new CustomEvent("tenant-admin:navigate", {
      detail: { tab: "human-conversations" }
    }));
  }, []);

  const handleBroadcast = useCallback(() => {
    void (async () => {
      if (!data.broadcastText.trim()) {
        void message.warning(t("supervisorModule.messages.broadcastRequired"));
        return;
      }
      data.setSaving(true);
      try {
        const res = await broadcastToOnlineAgents(data.broadcastText.trim());
        void message.success(t("supervisorModule.messages.broadcastSuccess", { count: res.recipients }));
        data.setBroadcastOpen(false);
      } catch (err) {
        void message.error(t("supervisorModule.messages.broadcastFailed", { message: (err as Error).message }));
      } finally {
        data.setSaving(false);
      }
    })();
  }, [data, message, t]);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <SupervisorSummaryCards
        overview={data.overview}
        loading={data.loading}
        onRefresh={() => { void data.load(); }}
        onBroadcastOpen={() => {
          data.setBroadcastText("");
          data.setBroadcastOpen(true);
        }}
      />

      <SupervisorFilterBar
        loading={data.loading}
        departments={data.departments}
        teams={data.teams}
        agents={data.agents}
        departmentFilter={data.departmentFilter}
        teamFilter={data.teamFilter}
        agentFilter={data.agentFilter}
        scopeFilter={data.scopeFilter}
        onDepartmentChange={(value) => {
          data.setDepartmentFilter(value);
          data.setTeamFilter(undefined);
          data.setPage(1);
        }}
        onTeamChange={(value) => {
          data.setTeamFilter(value);
          data.setPage(1);
        }}
        onAgentChange={(value) => {
          data.setAgentFilter(value);
          data.setPage(1);
        }}
        onScopeChange={(value) => {
          data.setScopeFilter(value);
          data.setPage(1);
        }}
        onApply={() => { void data.load(); }}
      />

      <SupervisorConversationsTable
        loading={data.loading}
        conversations={data.conversations}
        onOpenHumanConversations={openHumanConversations}
        onPageChange={(nextPage) => {
          data.setPage(nextPage);
        }}
      />

      <SupervisorAgentsTable
        loading={data.loading}
        agents={data.agents}
      />

      <SupervisorBroadcastModal
        open={data.broadcastOpen}
        saving={data.saving}
        text={data.broadcastText}
        onCancel={() => data.setBroadcastOpen(false)}
        onOk={handleBroadcast}
        onTextChange={data.setBroadcastText}
      />
    </Space>
  );
}
