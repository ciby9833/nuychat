/**
 * 菜单路径与名称: 客户中心 -> Human Conversations / 人工会话
 * 文件职责: 人工会话模块主入口，负责串联三栏工作台的筛选栏、会话列表、消息详情与人工操作侧栏。
 * 主要交互文件:
 * - ./hooks/useHumanConversationsData.ts: 负责列表/详情加载、筛选状态、选中状态、消息渲染数据与侧栏状态。
 * - ./components/HumanConversationsFilterBar.tsx: 展示范围、坐席、日期筛选与概览统计。
 * - ./components/HumanConversationList.tsx: 展示左侧人工会话列表。
 * - ./components/HumanConversationDetailPane.tsx: 展示中间消息时间线与结构化消息内容。
 * - ./components/HumanConversationSidebar.tsx: 展示右侧会话信息、人工介入、转接与强制关闭操作。
 * - ./helpers.ts: 提供日期格式化、相对时间、风险色计算等辅助方法。
 * - ../../api.ts: 提供人工会话列表、详情、人工介入、转接、强制关闭等接口能力。
 * - ../../modules/ai-conversations/styles.ts: 复用现有三栏布局样式定义。
 */

import { Alert, App } from "antd";
import { useCallback } from "react";

import { forceCloseConversation, interveneConversation, transferConversation } from "../../api";
import { S } from "../ai-conversations/styles";
import { HumanConversationDetailPane } from "./components/HumanConversationDetailPane";
import { HumanConversationList } from "./components/HumanConversationList";
import { HumanConversationsFilterBar } from "./components/HumanConversationsFilterBar";
import { HumanConversationSidebar } from "./components/HumanConversationSidebar";
import { useHumanConversationsData } from "./hooks/useHumanConversationsData";

export function HumanConversationsTab() {
  const { message, modal } = App.useApp();
  const data = useHumanConversationsData();

  const handleIntervene = useCallback(async () => {
    if (!data.selectedConversationId || !data.interveneText.trim()) {
      void message.warning("请输入要发送给客户的内容");
      return;
    }
    data.setSaving(true);
    try {
      await interveneConversation(data.selectedConversationId, data.interveneText.trim());
      data.setInterveneText("");
      void message.success("人工消息已发送");
      await data.loadDetail(data.selectedConversationId);
      await data.loadList(true, data.selectedConversationId);
    } catch (err) {
      void message.error(`发送失败: ${(err as Error).message}`);
    } finally {
      data.setSaving(false);
    }
  }, [data, message]);

  const handleTransfer = useCallback(async () => {
    if (!data.selectedConversationId || !data.transferAgentId) {
      void message.warning("请选择目标人工坐席");
      return;
    }
    data.setSaving(true);
    try {
      await transferConversation(data.selectedConversationId, data.transferAgentId);
      void message.success("会话已转给人工坐席");
      await data.loadDetail(data.selectedConversationId);
      await data.loadList(true, data.selectedConversationId);
    } catch (err) {
      void message.error(`转接失败: ${(err as Error).message}`);
    } finally {
      data.setSaving(false);
    }
  }, [data, message]);

  const handleForceClose = useCallback(async () => {
    if (!data.selectedConversationId) return;
    modal.confirm({
      title: "确认强制关闭会话？",
      content: "该操作会直接结束当前会话/事项，并清空当前处理状态。此操作通常只用于异常处理。",
      okText: "确认关闭",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        data.setSaving(true);
        try {
          await forceCloseConversation(data.selectedConversationId, "closed from human conversation manager");
          void message.success("会话已强制关闭");
          await data.loadDetail(data.selectedConversationId);
          await data.loadList(true, data.selectedConversationId);
        } catch (err) {
          void message.error(`关闭失败: ${(err as Error).message}`);
        } finally {
          data.setSaving(false);
        }
      }
    });
  }, [data, message, modal]);

  return (
    <div style={S.root}>
      {data.error ? <Alert type="error" showIcon message={data.error} style={{ margin: 8, borderRadius: 8 }} /> : null}

      <HumanConversationsFilterBar
        loading={data.loading}
        selectedScope={data.selectedScope}
        selectedAgentId={data.selectedAgentId}
        agents={data.agents}
        datePreset={data.datePreset}
        customRange={data.customRange}
        summary={data.summary}
        onScopeChange={data.setSelectedScope}
        onAgentChange={data.setSelectedAgentId}
        onDatePresetChange={data.setDatePreset}
        onCustomRangeChange={data.setCustomRange}
        onRefresh={() => { void data.loadList(false); }}
      />

      <div style={S.body}>
        <HumanConversationList
          loading={data.loading}
          items={data.items}
          selectedConversationId={data.selectedConversationId}
          onSelect={data.setSelectedConversationId}
        />

        <HumanConversationDetailPane
          detail={data.detail}
          currentItem={data.currentItem}
          detailLoading={data.detailLoading}
          renderMessages={data.renderMessages}
          reactionsByTarget={data.reactionsByTarget}
        />

        <HumanConversationSidebar
          detail={data.detail}
          currentItem={data.currentItem}
          interveneText={data.interveneText}
          transferAgentId={data.transferAgentId}
          saving={data.saving}
          onlineAgents={data.onlineAgents}
          isEndedConversation={Boolean(data.isEndedConversation)}
          onInterveneTextChange={data.setInterveneText}
          onTransferAgentChange={data.setTransferAgentId}
          onIntervene={() => { void handleIntervene(); }}
          onTransfer={() => { void handleTransfer(); }}
          onForceClose={() => { void handleForceClose(); }}
        />
      </div>
    </div>
  );
}
