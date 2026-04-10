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

  const selectedAccount = vm.accounts.find((a) => a.waAccountId === vm.accountId) ?? null;
  const accountConnected = selectedAccount?.status.code === "connected";

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#efeae2]">
      <div className="min-h-0 flex-1 p-2 lg:p-3">
        <div
          className="grid h-full min-h-0 overflow-hidden rounded-[18px] border border-[#d1d7db] bg-[#f0f2f5] shadow-[0_18px_48px_rgba(17,27,33,0.08)]"
          style={{ gridTemplateColumns: "410px minmax(0,1fr) 360px" }}
        >
          <div className="min-h-0 border-r border-[#d1d7db] bg-white">
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
              onSync={() => { void vm.triggerSync(); }}
              syncing={vm.syncing}
            />
          </div>
          <div className="relative min-h-0 bg-[#efeae2]">
            {!accountConnected && selectedAccount && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#f8f9fa]/95 backdrop-blur-sm">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e9edef]">
                  <svg className="h-7 w-7 text-[#667781]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[#111b21]">账号已离线</p>
                <p className="max-w-[260px] text-center text-xs leading-relaxed text-[#667781]">
                  {selectedAccount.status.detail || "当前 WhatsApp 账号未连接，请联系管理员重新登录后再使用工作台。"}
                </p>
              </div>
            )}
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
              onClearQuoted={() => vm.setQuotedMessage(null)}
              uploadingAttachments={vm.uploadingAttachments}
              onRemoveAttachment={(localId) => vm.setUploadingAttachments((current) => current.filter((item) => item.localId !== localId))}
              onUploadFiles={(files) => { void vm.uploadFiles(files); }}
              onTakeover={() => { void vm.takeoverCurrentConversation(); }}
              onRelease={() => { void vm.releaseCurrentConversation(); }}
              onReplyToMessage={(message) => vm.setQuotedMessage(message)}
              onSendReaction={(message, emoji) => { void vm.reactToMessage(message, emoji); }}
              onSend={() => { void vm.sendCurrentMessage(); }}
              actionLoading={vm.actionLoading}
            />
          </div>
          <div className="min-h-0 border-l border-[#d1d7db] bg-[#f7f8fa]">
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
