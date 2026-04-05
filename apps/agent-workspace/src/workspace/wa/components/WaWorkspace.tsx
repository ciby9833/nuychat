/**
 * 功能名称: WA 工作台页面
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 组合 WA 左侧会话列表、中间聊天区和右侧上下文区。
 * 交互页面:
 * - ../../pages/DashboardPage.tsx: 通过路由挂载此页面。
 */

import { useState } from "react";

import type { Session } from "../../types";
import { WorkspacePageFrame } from "../../components/layout/WorkspacePageFrame";
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
    <WorkspacePageFrame
      title="WhatsApp 工作台"
      description="独立 WA 账号沟通区。与当前官方客服渠道分层，消息、接管和权限单独治理。"
      rightWidth={rightWidth}
      onStartResize={startRightResize}
      left={
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
      }
      center={
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
      }
      right={
        <WaContextPanel
          detail={vm.detail}
          session={session}
          onForceAssign={vm.forceAssignWaConversation}
          actionLoading={vm.actionLoading}
        />
      }
    />
  );
}
