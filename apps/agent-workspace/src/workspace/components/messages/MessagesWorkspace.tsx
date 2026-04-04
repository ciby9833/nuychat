import { InboxPanel } from "../InboxPanel";
import { TimelinePanel } from "../TimelinePanel";
import { RightPanel } from "../RightPanel";
import type { WorkspaceDashboardVM } from "../../hooks/useWorkspaceDashboard";
import { WorkspacePageFrame } from "../layout/WorkspacePageFrame";

type MessagesWorkspaceProps = {
  vm: WorkspaceDashboardVM;
  rightWidth: number;
  onStartResize: (e: React.MouseEvent) => void;
};

export function MessagesWorkspace({ vm, rightWidth, onStartResize }: MessagesWorkspaceProps) {
  return (
    <WorkspacePageFrame
      rightWidth={rightWidth}
      onStartResize={onStartResize}
      left={
        <InboxPanel
          showModeSwitch={false}
          leftPanelMode="conversations"
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
          onLeftPanelModeChange={(mode) => {
            if (mode === "tasks") vm.setLeftPanelMode("tasks");
          }}
          onViewChange={vm.handleViewChange}
          onTierFilterChange={vm.setTierFilter}
          onSearchTextChange={vm.setSearchText}
          onTaskSearchTextChange={vm.setTaskSearchText}
          onSelectConversation={vm.openConversation}
          onSelectTask={vm.openTaskConversation}
          onLoadMore={vm.loadMoreConversations}
        />
      }
      center={
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
      }
      right={
        <RightPanel
          currentAgentId={vm.agentId}
          rightTab={vm.rightTab}
          detail={vm.detail}
          copilot={vm.copilot}
          aiTraces={vm.aiTraces}
          tickets={vm.tickets}
          ticketDetailsById={vm.ticketDetailsById}
          ticketLoading={vm.ticketLoading}
          taskDraft={vm.taskDraft}
          colleagues={vm.colleagues}
          customer360={vm.customer360}
          onTabChange={vm.setRightTab}
          onSelectConversation={vm.setSelectedId}
          onCreateTicket={vm.doCreateTicket}
          onPatchTicket={vm.doPatchTicket}
          onAddTicketComment={vm.doAddTicketComment}
          onConsumeTaskDraft={() => vm.setTaskDraft(null)}
        />
      }
    />
  );
}
