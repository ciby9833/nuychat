import "../workspace.css";

import { useWorkspaceDashboard } from "../hooks/useWorkspaceDashboard";
import { InboxPanel } from "../components/InboxPanel";
import { TimelinePanel } from "../components/TimelinePanel";
import { RightPanel } from "../components/RightPanel";
import { WorkspaceHeader } from "../components/layout/WorkspaceHeader";

export function DashboardPage() {
  const vm = useWorkspaceDashboard();

  if (!vm.isLoggedIn || !vm.session) return null;

  return (
    <div className="workspace-root">
      {/* Row 1: header spanning all 3 columns */}
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
        view={vm.view}
        tierFilter={vm.tierFilter}
        searchText={vm.searchText}
        filteredConversations={vm.filteredConversations}
        viewSummaries={vm.viewSummaries}
        selectedId={vm.selectedId}
        hasMore={vm.hasMoreConversations}
        isLoading={vm.conversationsLoading}
        onViewChange={vm.handleViewChange}
        onTierFilterChange={vm.setTierFilter}
        onSearchTextChange={vm.setSearchText}
        onSelectConversation={vm.openConversation}
        onLoadMore={vm.loadMoreConversations}
      />

      {/* Row 2, col 2: chat timeline */}
      <TimelinePanel
        detail={vm.detail}
        messages={vm.messages}
        reply={vm.reply}
        pendingAttachments={vm.pendingAttachments}
        replyTargetMessageId={vm.replyTargetMessageId}
        viewHint={vm.viewHint}
        aiSuggestions={vm.copilot?.suggestions ?? []}
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
        onAddTaskFromMessage={(messageId, preview) => {
          vm.setTaskDraft({ sourceMessageId: messageId, sourceMessagePreview: preview });
          vm.setRightTab("orders");
        }}
      />

      {/* Row 2, col 3: right info panel */}
      <RightPanel
        rightTab={vm.rightTab}
        detail={vm.detail}
        copilot={vm.copilot}
        aiTraces={vm.aiTraces}
        skillRecommendation={vm.skillRecommendation}
        skillSchemas={vm.skillSchemas}
        tickets={vm.tickets}
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
        onConsumeTaskDraft={() => vm.setTaskDraft(null)}
        onExecuteSkill={vm.doExecuteSkill}
      />
    </div>
  );
}
