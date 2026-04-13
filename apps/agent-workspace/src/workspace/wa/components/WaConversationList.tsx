/**
 * 功能名称: WA 会话列表
 * 菜单路径: 工作台 / WA工作台 / 左侧会话栏
 * 文件职责: 展示账号切换、搜索、接管筛选与 WA 会话列表，布局对齐 WhatsApp Web 左侧导航栏。
 *          列表按 Chats / 群聊 / 频道 三个 tab 分类，默认展示 Chats。
 * 交互页面:
 * - ./WaWorkspace.tsx: 组合三栏 WA 工作台布局。
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { WaAccountItem, WaContactItem, WaConversationItem } from "../types";

type ConversationTab = "chats" | "groups" | "channels";

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
  onSync?: () => void;
  syncing?: boolean;
};

/** Derives which tab a conversation belongs to from its chatJid suffix. */
function getConversationTab(conversation: WaConversationItem): ConversationTab {
  if (conversation.chatJid.endsWith("@newsletter")) return "channels";
  if (conversation.chatJid.endsWith("@g.us") || conversation.conversationType === "group") return "groups";
  return "chats";
}

export function WaConversationList(props: WaConversationListProps) {
  const { t, i18n } = useTranslation();
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
    onOpenContact,
    onSync,
    syncing = false
  } = props;

  const [keyword, setKeyword] = useState("");
  const [activeTab, setActiveTab] = useState<ConversationTab>("chats");
  const TAB_CONFIG: { id: ConversationTab; label: string; icon: string }[] = [
    { id: "chats", label: t("wa.conversationList.tabs.chats"), icon: "💬" },
    { id: "groups", label: t("wa.conversationList.tabs.groups"), icon: "👥" },
    { id: "channels", label: t("wa.conversationList.tabs.channels"), icon: "📢" }
  ];

  // Count per tab (before keyword filter) for badge display
  const tabCounts = useMemo<Record<ConversationTab, number>>(() => {
    const counts: Record<ConversationTab, number> = { chats: 0, groups: 0, channels: 0 };
    for (const conv of conversations) {
      counts[getConversationTab(conv)]++;
    }
    return counts;
  }, [conversations]);

  // Unread count per tab for notification dot
  const tabUnread = useMemo<Record<ConversationTab, number>>(() => {
    const counts: Record<ConversationTab, number> = { chats: 0, groups: 0, channels: 0 };
    for (const conv of conversations) {
      if (conv.unreadCount > 0) {
        counts[getConversationTab(conv)] += conv.unreadCount;
      }
    }
    return counts;
  }, [conversations]);

  const tabConversations = useMemo(
    () => conversations.filter((conv) => getConversationTab(conv) === activeTab),
    [conversations, activeTab]
  );

  const visibleConversations = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return tabConversations;
    return tabConversations.filter((conversation) => {
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
  }, [tabConversations, keyword]);

  const selectedAccount = accounts.find((item) => item.waAccountId === accountId) ?? null;

  // Contacts without an existing conversation — only shown in the Chats tab
  const contactsWithoutConversation = useMemo(() => {
    if (activeTab !== "chats" || !accountId) return [];
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
  }, [activeTab, accountId, contacts, conversations, keyword]);

  const formatListTime = (value: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    const now = new Date();
    const sameDay = now.toDateString() === date.toDateString();
    return sameDay
      ? date.toLocaleTimeString(i18n.language, { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString(i18n.language, { month: "numeric", day: "numeric" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[#111b21]">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-sm font-semibold text-white">
              {selectedAccount?.displayName?.slice(0, 1).toUpperCase() || "W"}
            </div>
            <div>
              <div className="text-[17px] font-medium text-[#111b21]">{t("wa.common.whatsapp")}</div>
              <div className="mt-0.5 text-[12px] text-[#667781]">
                {selectedAccount?.displayName || t("wa.conversationList.allAccounts")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm">
              {tabCounts[activeTab]}
            </div>
            {onSync && (
              <button
                type="button"
                title={t("wa.conversationList.syncTitle")}
                onClick={onSync}
                disabled={syncing}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#667781] transition-colors hover:bg-white hover:text-[#111b21] disabled:opacity-40"
              >
                <span className={syncing ? "animate-spin inline-block" : ""}>{syncing ? "⟳" : "🔄"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Search + filters ────────────────────────────────────────────────── */}
      <div className="border-b border-[#d1d7db] bg-white px-3 py-3">
        <div className="rounded-[10px] bg-[#f0f2f5] px-3 py-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t("wa.conversationList.searchPlaceholder")}
            className="w-full border-0 bg-transparent text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
          />
        </div>
        <div className="mt-3 space-y-2">
          <select
            className="h-10 w-full rounded-[10px] border border-[#d1d7db] bg-white px-3 text-sm text-[#111b21] focus:outline-none"
            value={accountId ?? ""}
            onChange={(event) => onAccountChange(event.target.value || null)}
          >
            <option value="">{t("wa.conversationList.allAccounts")}</option>
            {accounts.map((account) => (
              <option key={account.waAccountId} value={account.waAccountId}>
                {account.displayName}
              </option>
            ))}
          </select>
          {activeTab !== "channels" && (
            <label className="flex items-center gap-2 text-xs text-[#667781]">
              <input
                type="checkbox"
                checked={assignedToMeOnly}
                onChange={(event) => onAssignedToMeOnlyChange(event.target.checked)}
              />
              {t("wa.conversationList.assignedToMeOnly")}
            </label>
          )}
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-[#d1d7db] bg-white">
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasUnread = tabUnread[tab.id] > 0 && !isActive;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-[#00a884] text-[#00a884]"
                  : "text-[#667781] hover:text-[#111b21]"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {hasUnread && (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {tabUnread[tab.id] > 99 ? "99+" : tabUnread[tab.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Conversation list ────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {loading ? <div className="px-4 py-3 text-sm text-[#667781]">{t("wa.conversationList.listLoading")}</div> : null}
        <div>
          {visibleConversations.map((conversation) => {
            const active = conversation.waConversationId === selectedConversationId;
            const title = conversation.displayName || conversation.subject || conversation.contactJid || conversation.chatJid;
            const isGroup = conversation.chatJid.endsWith("@g.us") || conversation.conversationType === "group";
            const isChannel = conversation.chatJid.endsWith("@newsletter");
            const secondary = isGroup
              ? conversation.chatJid
              : isChannel
                ? (conversation.chatJid)
                : (conversation.contactPhoneE164 || conversation.contactJid || conversation.chatJid);
            const subtitle = conversation.lastMessagePreview || secondary || t("wa.conversationList.noMessage");

            // Avatar letter / icon
            const avatarLetter = isChannel ? "📢" : isGroup ? "👥" : (title || "?").slice(0, 1).toUpperCase();
            const avatarBg = isChannel
              ? "bg-[#e7f3ff] text-[#1f6feb]"
              : isGroup
                ? "bg-[#e9edef] text-[#54656f]"
                : "bg-[#d9fdd3] text-[#005c4b]";

            return (
              <button
                key={conversation.waConversationId}
                type="button"
                onClick={() => onSelectConversation(conversation.waConversationId)}
                className={`w-full border-b border-[#e9edef] px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-[#f0f2f5]"
                    : "bg-white hover:bg-[#f5f6f6]"
                }`}
              >
                <div className="flex items-start gap-3">
                  {conversation.avatarUrl ? (
                    <img
                      src={conversation.avatarUrl}
                      alt={title || t("wa.conversationList.avatarAlt")}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold ${avatarBg}`}>
                      {avatarLetter}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-normal text-[#111b21]">{title}</div>
                        <div className="mt-0.5 truncate text-[13px] text-[#667781]">{secondary}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-[#667781]">{formatListTime(conversation.lastMessageAt)}</div>
                        {conversation.unreadCount > 0 ? (
                          <div className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                            {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[14px] text-[#667781]">{subtitle}</div>
                    {!isChannel && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-[#667781]">
                        <span>{conversation.currentReplierName || t("wa.conversationList.unassigned")}</span>
                        <span>{conversation.accountDisplayName || t("wa.common.waShort")}</span>
                      </div>
                    )}
                    {isChannel && (
                      <div className="mt-2 text-[12px] text-[#667781]">
                        <span>{conversation.accountDisplayName || t("wa.common.waShort")}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {!loading && visibleConversations.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-[#667781]">
              {keyword
                ? t("wa.conversationList.empty.search")
                : activeTab === "channels"
                  ? t("wa.conversationList.empty.channels")
                  : activeTab === "groups"
                    ? t("wa.conversationList.empty.groups")
                    : t("wa.conversationList.empty.chats")}
            </div>
          ) : null}

          {/* Contacts without conversation — Chats tab only */}
          {contactsWithoutConversation.length > 0 ? (
            <div className="border-t border-[#e9edef] px-3 py-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#667781]">
                {t("wa.conversationList.contacts")}
              </div>
              <div className="space-y-1">
                {contactsWithoutConversation.map((contact) => (
                  <button
                    key={contact.contactId}
                    type="button"
                    onClick={() => onOpenContact(contact.contactId)}
                    className="w-full rounded-[10px] border border-[#e9edef] bg-[#f8f9fa] px-3 py-3 text-left transition-colors hover:bg-[#f0f2f5]"
                  >
                    <div className="truncate text-[14px] text-[#111b21]">
                      {contact.displayName || contact.notifyName || contact.phoneE164 || contact.contactJid}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-[#667781]">
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
