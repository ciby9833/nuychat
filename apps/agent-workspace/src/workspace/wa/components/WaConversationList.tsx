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
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-sm font-semibold text-slate-900">WA 工作台</div>
        <div className="mt-1 text-xs text-slate-500">独立账号池，不与当前官方客服渠道混线。</div>
        <div className="mt-3 space-y-2">
          <select
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            value={accountId ?? ""}
            onChange={(event) => onAccountChange(event.target.value || null)}
          >
            <option value="">全部账号</option>
            {accounts.map((account) => (
              <option key={account.waAccountId} value={account.waAccountId}>
                {account.displayName} · {account.accountStatus}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={assignedToMeOnly}
              onChange={(event) => onAssignedToMeOnlyChange(event.target.checked)}
            />
            仅看我当前接管
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {loading ? <div className="px-2 py-3 text-sm text-slate-400">加载中...</div> : null}
        <div className="space-y-2">
          {conversations.map((conversation) => {
            const active = conversation.waConversationId === selectedConversationId;
            const title = conversation.subject || conversation.contactJid || conversation.chatJid;
            return (
              <button
                key={conversation.waConversationId}
                type="button"
                onClick={() => onSelectConversation(conversation.waConversationId)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                  active
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium text-slate-900">{title}</div>
                  <span className="text-[11px] uppercase text-slate-400">{conversation.conversationType}</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{conversation.lastMessagePreview || "暂无消息"}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>{conversation.accountDisplayName || "WA账号"}</span>
                  <span>{conversation.currentReplierName ? `当前回复: ${conversation.currentReplierName}` : "未接管"}</span>
                </div>
              </button>
            );
          })}
          {!loading && conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              当前没有可见 WA 会话
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
