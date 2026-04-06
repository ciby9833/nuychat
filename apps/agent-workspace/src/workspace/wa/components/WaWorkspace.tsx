/**
 * 功能名称: WA 工作台页面
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 组合 WA 左侧会话列表、中间聊天区和右侧上下文区，呈现接近 WhatsApp Web 的三栏工作布局。
 * 交互页面:
 * - ../../pages/DashboardPage.tsx: 通过路由挂载此页面。
 */

import { useState } from "react";

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
  const [rightWidth, setRightWidth] = useState(320);

  const startRightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setRightWidth(Math.max(260, Math.min(520, startWidth + delta)));
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

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#efeae2]">
      <div className="min-h-0 flex-1 p-3">
        <div
          className="grid h-full min-h-0 overflow-hidden rounded-[24px] border border-[#d7dbdf] bg-[#f0f2f5] shadow-[0_14px_34px_rgba(17,27,33,0.08)]"
          style={{ gridTemplateColumns: `360px minmax(0,1fr) 8px ${rightWidth}px` }}
        >
          <div className="min-h-0 border-r border-[#d7dbdf] bg-[#ffffff]">
            <WaConversationList
              accounts={vm.accounts}
              accountId={vm.accountId}
              onAccountChange={vm.setAccountId}
              assignedToMeOnly={vm.assignedToMeOnly}
              onAssignedToMeOnlyChange={vm.setAssignedToMeOnly}
              conversations={vm.conversations}
              selectedConversationId={vm.selectedConversationId}
              loading={vm.loading}
              onSelectConversation={vm.setSelectedConversationId}
            />
          </div>
          <div className="min-h-0 bg-[#efeae2]">
            <WaChatPanel
              detail={vm.detail}
              detailLoading={vm.detailLoading}
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
          <div className="cursor-col-resize bg-[#e9edef]" onMouseDown={startRightResize} />
          <div className="min-h-0 border-l border-[#d7dbdf] bg-[#ffffff]">
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
