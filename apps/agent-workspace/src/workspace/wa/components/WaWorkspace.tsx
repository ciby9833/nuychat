/**
 * 功能名称: WA 工作台页面
 * 菜单路径: 工作台 / WA工作台
 * 文件职责: 组合 WA 左侧会话列表、中间聊天区和右侧信息栏，呈现接近 WhatsApp Web 的主工作界面。
 * 交互页面:
 * - ../../pages/DashboardPage.tsx: 通过路由挂载此页面。
 */

import type { Session } from "../../types";
import { useState } from "react";
import { Button, Modal, QRCode, Spin, Typography } from "antd";
import { CheckCircleFilled, LoadingOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useWaWorkspace } from "../hooks/useWaWorkspace";
import { WaChatPanel } from "./WaChatPanel";
import { WaContextPanel } from "./WaContextPanel";
import { WaConversationList } from "./WaConversationList";

type WaWorkspaceProps = {
  session: Session;
};

export function WaWorkspace({ session }: WaWorkspaceProps) {
  const { t } = useTranslation();
  const vm = useWaWorkspace(session);
  const [focusedParticipantJid, setFocusedParticipantJid] = useState<string | null>(null);

  const selectedAccount = vm.accounts.find((a) => a.waAccountId === vm.accountId) ?? null;
  const loginTask = vm.loginTask;
  const loginTaskAccount = loginTask ? vm.accounts.find((a) => a.waAccountId === loginTask.waAccountId) ?? null : null;
  const selectedAccountStatusCode = selectedAccount?.status.code ?? null;
  const accountConnected = selectedAccountStatusCode === "connected";
  const requiresInteractiveLogin = ["offline", "failed", "session_expired", "never_logged_in"].includes(
    selectedAccountStatusCode ?? ""
  );
  const shouldShowQr = loginTask?.status.code === "qr_required" && Boolean(loginTask.qrCode);
  const isImageQrCode = typeof loginTask?.qrCode === "string" && loginTask.qrCode.startsWith("data:image/");
  const showLoadingState = Boolean(
    loginTask?.status.code &&
    ((loginTask.status.code === "qr_required" && !loginTask.qrCode) ||
      ["qr_scanned", "connecting"].includes(loginTask.status.code))
  );
  const canOpenLogin = Boolean(selectedAccount) && requiresInteractiveLogin;

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#efeae2]">
      <div className="min-h-0 flex-1 p-2 lg:p-3">
        <div
          className="relative grid h-full min-h-0 overflow-hidden rounded-[18px] border border-[#d1d7db] bg-[#f0f2f5] shadow-[0_18px_48px_rgba(17,27,33,0.08)]"
          style={{ gridTemplateColumns: "410px minmax(0,1fr) 360px" }}
        >
          {!loginTask && requiresInteractiveLogin && selectedAccount && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[18px] bg-[#f8f9fa]/95 backdrop-blur-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e9edef]">
                <svg className="h-7 w-7 text-[#667781]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#111b21]">{t("wa.workspace.offlineTitle")}</p>
              {canOpenLogin ? (
                <Button
                  type="primary"
                  loading={vm.refreshingLoginTask}
                  onClick={() => { void vm.openLoginTask(selectedAccount); }}
                >
                  {t("wa.workspace.scanLogin")}
                </Button>
              ) : (
                <p className="max-w-[260px] text-center text-xs leading-relaxed text-[#667781]">
                  {selectedAccount.status.detail || t("wa.workspace.offlineDetail")}
                </p>
              )}
            </div>
          )}
          <div className="min-h-0 border-r border-[#d1d7db] bg-white">
            <WaConversationList
              accounts={vm.accounts}
              accountId={vm.accountId}
              onAccountChange={vm.setAccountId}
              keyword={vm.searchKeyword}
              onKeywordChange={vm.setSearchKeyword}
              assignedToMeOnly={vm.assignedToMeOnly}
              onAssignedToMeOnlyChange={vm.setAssignedToMeOnly}
              archivedOnly={vm.archivedOnly}
              onArchivedOnlyChange={vm.setArchivedOnly}
              conversations={vm.conversations}
              contacts={vm.contacts}
              selectedConversationId={vm.selectedConversationId}
              loading={vm.loading}
              onSelectConversation={vm.selectConversation}
              onOpenContact={vm.openContactConversation}
              onArchiveConversation={(conversationId, archive) => { void vm.archiveConversation(conversationId, archive); }}
              onSync={() => { void vm.triggerSync(); }}
              syncing={vm.syncing}
              syncEnabled={accountConnected}
            />
          </div>
          <div className="min-h-0 bg-[#efeae2]">
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
              onAddMention={vm.addMention}
              quotedMessage={vm.quotedMessage}
              onClearQuoted={() => vm.setQuotedMessage(null)}
              uploadingAttachments={vm.uploadingAttachments}
              onRemoveAttachment={(localId) => vm.setUploadingAttachments((current) => current.filter((item) => item.localId !== localId))}
              onUploadFiles={(files) => { void vm.uploadFiles(files); }}
              onTakeover={() => { void vm.takeoverCurrentConversation(); }}
              onRelease={() => { void vm.releaseCurrentConversation(); }}
              onReplyToMessage={(message) => vm.setQuotedMessage(message)}
              onSendReaction={(message, emoji) => { void vm.reactToMessage(message, emoji); }}
              onEditMessage={(message, text) => { void vm.editMessage(message, text); }}
              onDeleteMessage={(message, scope) => { void vm.deleteMessage(message, scope); }}
              onMentionClick={(mention) => setFocusedParticipantJid(mention.jid)}
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
              focusedParticipantJid={focusedParticipantJid}
            />
          </div>
        </div>
      </div>

      <Modal
        title={t("wa.workspace.loginModal.title", { name: loginTask?.accountName ?? "" })}
        open={Boolean(loginTask)}
        onCancel={vm.closeLoginTask}
        destroyOnHidden
        footer={loginTask ? (
          <div className="flex items-center justify-end gap-2">
            {["offline", "failed", "session_expired"].includes(loginTask.status.code) && loginTaskAccount ? (
              <Button
                type="primary"
                loading={vm.refreshingLoginTask}
                onClick={() => { void vm.openLoginTask(loginTaskAccount); }}
              >
                {t("wa.workspace.loginModal.retry")}
              </Button>
            ) : null}
            <Button onClick={vm.closeLoginTask}>{t("wa.workspace.loginModal.close")}</Button>
          </div>
        ) : null}
        width={520}
      >
        {loginTask ? (
          <div className="flex flex-col items-center gap-4 pt-2">
            {shouldShowQr ? (
              isImageQrCode ? (
                <img
                  src={loginTask.qrCode}
                  alt={`WA QR ${loginTask.accountName}`}
                  className="h-[280px] w-[280px] rounded-xl border border-[#dfe5e7] bg-white p-2 object-contain"
                />
              ) : (
                <QRCode value={loginTask.qrCode} size={280} />
              )
            ) : showLoadingState ? (
              <div className="flex h-[280px] w-[280px] items-center justify-center rounded-xl border border-[#dfe5e7] bg-[#fafafa]">
                <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
              </div>
            ) : loginTask.status.code === "connected" ? (
              <div className="flex h-[280px] w-[280px] items-center justify-center rounded-xl border border-[#dfe5e7] bg-[#f6ffed]">
                <CheckCircleFilled style={{ fontSize: 48, color: "#52c41a" }} />
              </div>
            ) : (
              <div className="flex h-[280px] w-[280px] items-center justify-center rounded-xl border border-[#dfe5e7] bg-[#fff2f0]">
                <Typography.Text type="danger">{t("wa.workspace.loginModal.rescan")}</Typography.Text>
              </div>
            )}
            <Typography.Text strong>{loginTask.status.label}</Typography.Text>
            <Typography.Text type="secondary">{loginTask.status.detail}</Typography.Text>
            {loginTask.disconnectReason ? (
              <Typography.Text type="danger">
                {t("wa.workspace.loginModal.disconnectReason", { value: loginTask.disconnectReason })}
              </Typography.Text>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
