/**
 * 功能名称: WA 工作台页面
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 组合 WA 左侧会话列表、中间聊天区和右侧信息栏，呈现接近 WhatsApp Web 的主工作界面。
 * 交互页面:
 * - ../../pages/DashboardPage.tsx: 通过路由挂载此页面。
 */

import type { Session } from "../../types";
import { useWaWorkspace } from "../hooks/useWaWorkspace";
import { WaChatPanel } from "./WaChatPanel";
import { WaContextPanel } from "./WaContextPanel";
import { WaConversationList } from "./WaConversationList";

type WaWorkspaceProps = {
  session: Session;
};

export function WaWorkspace({ session }: WaWorkspaceProps) {
  const vm = useWaWorkspace(session);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#0b141a]">
      <div className="min-h-0 flex-1 p-2 lg:p-3">
        <div
          className="grid h-full min-h-0 overflow-hidden rounded-[18px] border border-[#1f2c33] bg-[#111b21] shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
          style={{ gridTemplateColumns: "410px minmax(0,1fr) 360px" }}
        >
          <div className="min-h-0 border-r border-[#222d34] bg-[#111b21]">
            <WaConversationList
              accounts={vm.accounts}
              accountId={vm.accountId}
              onAccountChange={vm.setAccountId}
              assignedToMeOnly={vm.assignedToMeOnly}
              onAssignedToMeOnlyChange={vm.setAssignedToMeOnly}
              conversations={vm.conversations}
              contacts={vm.contacts}
              selectedConversationId={vm.selectedConversationId}
              loading={vm.loading}
              onSelectConversation={vm.selectConversation}
              onOpenContact={vm.openContactConversation}
            />
          </div>
          <div className="min-h-0 bg-[#0b141a]">
            <WaChatPanel
              session={session}
              detail={vm.detail}
              detailLoading={vm.detailLoading}
              firstUnreadCount={vm.unreadCountBeforeOpen}
              hasMoreMessages={vm.hasMoreMessages}
              loadingMoreMessages={vm.loadingMoreMessages}
              onLoadMoreMessages={() => { void vm.loadMoreMessages(); }}
              composerText={vm.composerText}
              onComposerTextChange={vm.setComposerText}
              quotedMessage={vm.quotedMessage}
              onClearQuoted={() => vm.setQuotedMessageId(null)}
              uploadingAttachments={vm.uploadingAttachments}
              onRemoveAttachment={(localId) => vm.setUploadingAttachments((current) => current.filter((item) => item.localId !== localId))}
              onUploadFiles={(files) => { void vm.uploadFiles(files); }}
              onTakeover={() => { void vm.takeoverCurrentConversation(); }}
              onRelease={() => { void vm.releaseCurrentConversation(); }}
              onReplyToMessage={(providerMessageId) => vm.setQuotedMessageId(providerMessageId)}
              onSendReaction={(message, emoji) => { void vm.reactToMessage(message, emoji); }}
              onSend={() => { void vm.sendCurrentMessage(); }}
              actionLoading={vm.actionLoading}
            />
          </div>
          <div className="min-h-0 border-l border-[#222d34] bg-[#111b21]">
            <WaContextPanel
              detail={vm.detail}
              session={session}
              onForceAssign={vm.forceAssignWaConversation}
              actionLoading={vm.actionLoading}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
