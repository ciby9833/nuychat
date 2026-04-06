/**
 * 功能名称: WA 会话列表
 * 菜单路径: 工作台 / WA工作台 / 左侧会话栏
 * 文件职责: 展示账号筛选、我的接管筛选与 WA 会话列表。
 * 交互页面:
 * - ./WaWorkspace.tsx: 组合三栏 WA 工作台布局。
 */

import type { WaAccountItem, WaConversationItem } from "../types";

type WaConversationListProps = {
  accounts: WaAccountItem[];
  accountId: string | null;
  onAccountChange: (value: string | null) => void;
  assignedToMeOnly: boolean;
  onAssignedToMeOnlyChange: (value: boolean) => void;
  conversations: WaConversationItem[];
  selectedConversationId: string | null;
  loading: boolean;
  onSelectConversation: (waConversationId: string) => void;
};

export function WaConversationList(props: WaConversationListProps) {
  const {
    accounts,
    accountId,
    onAccountChange,
    assignedToMeOnly,
    onAssignedToMeOnlyChange,
    conversations,
    selectedConversationId,
    loading,
    onSelectConversation
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#ffffff]">
      <div className="border-b border-[#d7dbdf] bg-[#f0f2f5] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-[#111b21]">WhatsApp</div>
            <div className="mt-0.5 text-[11px] text-[#667781]">{accounts.length} 个账号</div>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm">
            {assignedToMeOnly ? "我的接管" : "全部会话"}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <select
            className="h-10 w-full rounded-xl border border-[#d1d7db] bg-white px-3 text-sm text-[#111b21] focus:outline-none focus:ring-2 focus:ring-[#00a884]/20"
            value={accountId ?? ""}
            onChange={(event) => onAccountChange(event.target.value || null)}
          >
            <option value="">全部账号</option>
            {accounts.map((account) => (
              <option key={account.waAccountId} value={account.waAccountId}>
                {account.displayName} · {account.uiStatus.label}{account.uiStatus.code === "connected" && account.syncStatus.code !== "ready" ? ` / ${account.syncStatus.label}` : ""}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-[#54656f]">
            <input
              type="checkbox"
              checked={assignedToMeOnly}
              onChange={(event) => onAssignedToMeOnlyChange(event.target.checked)}
            />
            仅看我当前接管
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {loading ? <div className="px-4 py-3 text-sm text-[#8696a0]">加载中...</div> : null}
        <div>
          {conversations.map((conversation) => {
            const active = conversation.waConversationId === selectedConversationId;
            const title = conversation.displayName || conversation.subject || conversation.contactJid || conversation.chatJid;
            const secondary = conversation.conversationType === "group"
              ? conversation.chatJid
              : (conversation.contactPhoneE164 || conversation.contactJid || conversation.chatJid);
            return (
              <button
                key={conversation.waConversationId}
                type="button"
                onClick={() => onSelectConversation(conversation.waConversationId)}
                className={`w-full border-b border-[#f0f2f5] px-4 py-3 text-left transition-colors ${
                  active
                    ? "bg-[#f0fdf9]"
                    : "bg-white hover:bg-[#f5f6f6]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#d9fdd3] text-sm font-semibold text-[#005c4b]">
                      {(title || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[#111b21]">{title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-[#8696a0]">{secondary}</div>
                      <div className="mt-1 truncate text-xs text-[#667781]">{conversation.lastMessagePreview || "暂无消息"}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] uppercase text-[#8696a0]">{conversation.conversationType}</div>
                    {conversation.unreadCount > 0 ? (
                      <div className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 pl-14 text-[11px] text-[#8696a0]">
                  <span>{conversation.accountDisplayName || "WA"}</span>
                  <span>{conversation.currentReplierName || "未接管"}</span>
                </div>
              </button>
            );
          })}
          {!loading && conversations.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[#8696a0]">
              当前没有会话
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
