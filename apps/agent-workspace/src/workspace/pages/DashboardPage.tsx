import { useState } from "react";
import { useWorkspaceDashboard } from "../hooks/useWorkspaceDashboard";
import { InboxPanel } from "../components/InboxPanel";
import { TimelinePanel } from "../components/TimelinePanel";
import { RightPanel } from "../components/RightPanel";
import { WorkspaceHeader } from "../components/layout/WorkspaceHeader";
import { TooltipProvider } from "../../components/ui/tooltip";

export function DashboardPage() {
  const vm = useWorkspaceDashboard();
  const [rightWidth, setRightWidth] = useState(300);

  const startRightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setRightWidth(Math.max(240, Math.min(560, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (!vm.isLoggedIn || !vm.session) return null;

  return (
    <TooltipProvider>
      <div
        className="workspace-root"
        style={{ gridTemplateColumns: `var(--inbox-w) 1fr 5px ${rightWidth}px` }}
      >
        {/* Row 1: header spanning all columns */}
        <WorkspaceHeader
          tenantId={vm.tenantId}
          tenantSlug={vm.tenantSlug}
          agentId={vm.agentId}
          socketStatus={vm.socketStatus}
          memberships={vm.memberships}
          session={vm.session}
          onSwitchTenant={vm.onSwitchTenant}
          onLogout={vm.onLogout}
        />

        {/* Row 2, col 1: conversation inbox */}
        <InboxPanel
          leftPanelMode={vm.leftPanelMode}
          view={vm.view}
          tierFilter={vm.tierFilter}
          searchText={vm.searchText}
          taskSearchText={vm.taskSearchText}
          filteredConversations={vm.filteredConversations}
          filteredMyTasks={vm.filteredMyTasks}
          viewSummaries={vm.viewSummaries}
          selectedId={vm.selectedId}
          hasMore={vm.hasMoreConversations}
          isLoading={vm.conversationsLoading}
          taskLoading={vm.myTasksLoading}
          onLeftPanelModeChange={vm.setLeftPanelMode}
          onViewChange={vm.handleViewChange}
          onTierFilterChange={vm.setTierFilter}
          onSearchTextChange={vm.setSearchText}
          onTaskSearchTextChange={vm.setTaskSearchText}
          onSelectConversation={vm.openConversation}
          onSelectTask={vm.openTaskConversation}
          onLoadMore={vm.loadMoreConversations}
        />

        {/* Row 2, col 2: chat timeline */}
        <TimelinePanel
          detail={vm.detail}
          messages={vm.messages}
          reply={vm.reply}
          pendingAttachments={vm.pendingAttachments}
          replyTargetMessageId={vm.replyTargetMessageId}
          composerSkillAssist={vm.composerSkillAssist}
          skillSchemas={vm.skillSchemas}
          viewHint={vm.viewHint}
          aiSuggestions={vm.composerAiSuggestions}
          recommendedSkills={(vm.skillRecommendation?.recommendations ?? []).map((r) => r.skillName)}
          isAssignedToMe={vm.isAssignedToMe}
          actionLoading={vm.actionLoading}
          tickets={vm.tickets}
          colleagues={vm.colleagues}
          onReplyChange={vm.setReply}
          onSendReply={async () => { await vm.sendReply(); }}
          onSendReaction={vm.sendReaction}
          onUploadFiles={vm.handleUploadFiles}
          onClearAttachments={() => vm.setPendingAttachments([])}
          onRemoveAttachment={vm.removePendingAttachment}
          onSetReplyTarget={vm.setReplyTargetMessageId}
          onAssign={vm.doAssign}
          onHandoff={vm.doHandoff}
          onTransfer={vm.doTransfer}
          onResolve={vm.doResolve}
          onManualSkillAssist={vm.onManualSkillAssist}
          onAddTaskFromMessage={(messageId, preview) => {
            vm.setTaskDraft({ sourceMessageId: messageId, sourceMessagePreview: preview });
            vm.setRightTab("orders");
          }}
        />

        {/* Resize handle between timeline and right panel */}
        <div className="resize-handle" onMouseDown={startRightResize} />

        {/* Row 2, col 4: right info panel */}
        <RightPanel
          currentAgentId={vm.agentId}
          rightTab={vm.rightTab}
          detail={vm.detail}
          copilot={vm.copilot}
          aiTraces={vm.aiTraces}
          skillRecommendation={vm.skillRecommendation}
          skillSchemas={vm.skillSchemas}
          tickets={vm.tickets}
          ticketDetailsById={vm.ticketDetailsById}
          ticketLoading={vm.ticketLoading}
          taskDraft={vm.taskDraft}
          colleagues={vm.colleagues}
          skillExecuting={vm.skillExecuting}
          lastSkillResult={vm.lastSkillResult}
          customer360={vm.customer360}
          onTabChange={vm.setRightTab}
          onSelectConversation={vm.setSelectedId}
          onApplyTopRecommendedSkills={vm.applyTopRecommendedSkills}
          onSetPreferredSkills={vm.updatePreferredSkills}
          onCreateTicket={vm.doCreateTicket}
          onPatchTicket={vm.doPatchTicket}
          onAddTicketComment={vm.doAddTicketComment}
          onConsumeTaskDraft={() => vm.setTaskDraft(null)}
          onExecuteSkill={vm.doExecuteSkill}
        />
      </div>
    </TooltipProvider>
  );
}
