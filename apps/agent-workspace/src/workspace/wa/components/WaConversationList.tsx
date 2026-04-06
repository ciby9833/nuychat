/**
 * 功能名称: WA 会话列表
 * 菜单路径: 工作台 / WA工作台 / 左侧会话栏
 * 文件职责: 展示账号切换、搜索、接管筛选与 WA 会话列表，布局对齐 WhatsApp Web 左侧导航栏。
 * 交互页面:
 * - ./WaWorkspace.tsx: 组合三栏 WA 工作台布局。
 */

import { useMemo, useState } from "react";

import type { WaAccountItem, WaContactItem, WaConversationItem } from "../types";

type WaConversationListProps = {
  accounts: WaAccountItem[];
  accountId: string | null;
  onAccountChange: (value: string | null) => void;
  assignedToMeOnly: boolean;
  onAssignedToMeOnlyChange: (value: boolean) => void;
  conversations: WaConversationItem[];
  contacts: WaContactItem[];
  selectedConversationId: string | null;
  loading: boolean;
  onSelectConversation: (waConversationId: string) => void;
  onOpenContact: (contactId: string) => void;
};

export function WaConversationList(props: WaConversationListProps) {
  const {
    accounts,
    accountId,
    onAccountChange,
    assignedToMeOnly,
    onAssignedToMeOnlyChange,
    conversations,
    contacts,
    selectedConversationId,
    loading,
    onSelectConversation,
    onOpenContact
  } = props;
  const [keyword, setKeyword] = useState("");

  const visibleConversations = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return conversations;
    return conversations.filter((conversation) => {
      const haystack = [
        conversation.displayName,
        conversation.subject,
        conversation.contactName,
        conversation.contactPhoneE164,
        conversation.contactJid,
        conversation.chatJid,
        conversation.lastMessagePreview
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [conversations, keyword]);

  const selectedAccount = accounts.find((item) => item.waAccountId === accountId) ?? null;
  const contactsWithoutConversation = useMemo(() => {
    if (!accountId) return [];
    const covered = new Set(
      conversations.flatMap((conversation) => [
        conversation.contactJid,
        conversation.chatJid,
        conversation.contactPhoneE164
      ].filter(Boolean))
    );
    return contacts.filter((contact) => {
      if (keyword.trim()) {
        const haystack = [contact.displayName, contact.notifyName, contact.phoneE164, contact.contactJid]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword.trim().toLowerCase());
      }
      return !covered.has(contact.contactJid) && !covered.has(contact.phoneE164 ?? "");
    });
  }, [accountId, contacts, conversations, keyword]);

  const formatListTime = (value: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    const now = new Date();
    const sameDay = now.toDateString() === date.toDateString();
    return sameDay
      ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString([], { month: "numeric", day: "numeric" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111b21] text-[#e9edef]">
      <div className="border-b border-[#222d34] bg-[#202c33] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-sm font-semibold text-white">
              {selectedAccount?.displayName?.slice(0, 1).toUpperCase() || "W"}
            </div>
            <div>
              <div className="text-[17px] font-medium text-white">WhatsApp</div>
              <div className="mt-0.5 text-[12px] text-[#8696a0]">
                {selectedAccount?.displayName || "全部账号"}
              </div>
            </div>
          </div>
          <div className="rounded-full bg-[#111b21] px-3 py-1 text-[11px] font-medium text-[#d1d7db]">
            {visibleConversations.length}
          </div>
        </div>
      </div>

      <div className="border-b border-[#222d34] bg-[#111b21] px-3 py-3">
        <div className="rounded-[10px] bg-[#202c33] px-3 py-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索或开始新聊天"
            className="w-full border-0 bg-transparent text-sm text-[#e9edef] outline-none placeholder:text-[#8696a0]"
          />
        </div>
        <div className="mt-3 space-y-2">
          <select
            className="h-10 w-full rounded-[10px] border border-[#2a3942] bg-[#111b21] px-3 text-sm text-[#e9edef] focus:outline-none"
            value={accountId ?? ""}
            onChange={(event) => onAccountChange(event.target.value || null)}
          >
            <option value="">全部账号</option>
            {accounts.map((account) => (
              <option key={account.waAccountId} value={account.waAccountId}>
                {account.displayName}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-[#aebac1]">
            <input
              type="checkbox"
              checked={assignedToMeOnly}
              onChange={(event) => onAssignedToMeOnlyChange(event.target.checked)}
            />
            只看我当前接管
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[#111b21]">
        {loading ? <div className="px-4 py-3 text-sm text-[#8696a0]">加载中...</div> : null}
        <div>
          {visibleConversations.map((conversation) => {
            const active = conversation.waConversationId === selectedConversationId;
            const title = conversation.displayName || conversation.subject || conversation.contactJid || conversation.chatJid;
            const secondary = conversation.conversationType === "group"
              ? conversation.chatJid
              : (conversation.contactPhoneE164 || conversation.contactJid || conversation.chatJid);
            const subtitle = conversation.lastMessagePreview || secondary || "暂无消息";
            return (
              <button
                key={conversation.waConversationId}
                type="button"
                onClick={() => onSelectConversation(conversation.waConversationId)}
                className={`w-full border-b border-[#202c33] px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-[#202c33]"
                    : "bg-[#111b21] hover:bg-[#182229]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#d9fdd3] text-base font-semibold text-[#005c4b]">
                    {conversation.conversationType === "group" ? "+" : (title || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-normal text-[#e9edef]">{title}</div>
                        <div className="mt-0.5 truncate text-[13px] text-[#8696a0]">{secondary}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-[#8696a0]">{formatListTime(conversation.lastMessageAt)}</div>
                        {conversation.unreadCount > 0 ? (
                          <div className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 py-0.5 text-[11px] font-semibold text-[#111b21]">
                            {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="truncate text-[14px] text-[#aebac1]">{subtitle}</div>
                      <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-[#8696a0]">
                        {conversation.conversationType === "group" ? "GROUP" : "DIRECT"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-[#8696a0]">
                      <span>{conversation.currentReplierName || "未接管"}</span>
                      <span>{conversation.accountDisplayName || "WA"}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {!loading && visibleConversations.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-[#8696a0]">
              没有匹配的会话
            </div>
          ) : null}
          {contactsWithoutConversation.length > 0 ? (
            <div className="border-t border-[#202c33] px-3 py-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#8696a0]">
                联系人
              </div>
              <div className="space-y-1">
                {contactsWithoutConversation.map((contact) => (
                  <button
                    key={contact.contactId}
                    type="button"
                    onClick={() => onOpenContact(contact.contactId)}
                    className="w-full rounded-[10px] border border-[#202c33] bg-[#111b21] px-3 py-3 text-left transition-colors hover:bg-[#182229]"
                  >
                    <div className="truncate text-[14px] text-[#e9edef]">
                      {contact.displayName || contact.notifyName || contact.phoneE164 || contact.contactJid}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-[#8696a0]">
                      {contact.phoneE164 || contact.contactJid}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
