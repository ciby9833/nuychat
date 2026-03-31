import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationItem, ConversationListItem, ConversationViewSummaries, SideView } from "../types";
import { dateGroupLabel, listTimestamp } from "../utils";
import { cn } from "../../lib/utils";

type TierFilter = "all" | "vip" | "premium" | "standard";

type InboxPanelProps = {
  view: SideView;
  tierFilter: TierFilter;
  searchText: string;
  filteredConversations: ConversationItem[];
  viewSummaries: ConversationViewSummaries;
  selectedId: string | null;
  hasMore: boolean;
  isLoading: boolean;
  onViewChange: (v: SideView) => void;
  onTierFilterChange: (v: TierFilter) => void;
  onSearchTextChange: (v: string) => void;
  onSelectConversation: (id: string) => void;
  onLoadMore: () => void;
};

function tierAvatarClasses(tier: string | undefined): string {
  const t = (tier ?? "standard").toLowerCase();
  if (t === "vip") return "bg-amber-500 text-white";
  if (t === "premium") return "bg-violet-500 text-white";
  return "bg-slate-400 text-white";
}

export function InboxPanel(props: InboxPanelProps) {
  const {
    view,
    tierFilter,
    searchText,
    filteredConversations,
    viewSummaries,
    selectedId,
    hasMore,
    isLoading,
    onViewChange,
    onTierFilterChange,
    onSearchTextChange,
    onSelectConversation,
    onLoadMore
  } = props;

  const { t } = useTranslation();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) onLoadMoreRef.current(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const isFollowUpView = view === "follow_up";

  const listItems = useMemo<ConversationListItem[]>(() => {
    const result: ConversationListItem[] = [];
    let lastLabel = "";
    for (const c of filteredConversations) {
      const label = dateGroupLabel(c.lastMessageAt ?? c.occurredAt);
      if (label !== lastLabel) {
        result.push({ kind: "header", label });
        lastLabel = label;
      }
      result.push({ kind: "conversation", data: c });
    }
    return result;
  }, [filteredConversations]);

  const TIER_KEYS = ["all", "vip", "premium", "standard"] as const;
  const VIEW_KEYS = ["all", "mine", "follow_up"] as const;

  return (
    <aside
      className="flex flex-col bg-[var(--color-surface)] border-r border-slate-200 overflow-hidden"
      style={{ gridColumn: 1, gridRow: 2 }}
    >
      {/* Header section */}
      <div className="flex flex-col gap-0 border-b border-slate-200 bg-white">
        {/* View tabs */}
        <div className="flex items-center px-3 pt-2.5 gap-0">
          {VIEW_KEYS.map((v) => {
            const unread = viewSummaries[v]?.unreadMessages ?? 0;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onViewChange(v)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  view === v
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                {t(`inbox.views.${v}`)}
                {unread > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="w-full h-7 pl-7 pr-3 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-colors"
              value={searchText}
              onChange={(e) => onSearchTextChange(e.target.value)}
              placeholder={t("inbox.search")}
            />
          </div>
        </div>

        {/* Tier filter chips */}
        {!isFollowUpView && (
          <div className="flex items-center gap-1 px-3 pb-2.5 flex-wrap">
            {TIER_KEYS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTierFilterChange(tag)}
                className={cn(
                  "h-5 px-2 rounded-full text-[10px] font-semibold transition-colors",
                  tierFilter === tag
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {t(`inbox.tier.${tag}`)}
              </button>
            ))}
          </div>
        )}

        {isFollowUpView && (
          <div className="mx-3 mb-2.5 flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-600">
            <span>📋</span>
            <span>{t("inbox.followUpHint")}</span>
          </div>
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-xs">{t("inbox.empty")}</p>
          </div>
        )}

        {listItems.map((item, idx) => {
          if (item.kind === "header") {
            return (
              <div key={`header-${item.label}-${idx}`} className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-transparent sticky top-0 z-[1] backdrop-blur-sm">
                {item.label}
              </div>
            );
          }

          const c = item.data;
          const unread = c.unreadCount ?? 0;
          const displayName = c.customerName ?? c.customerRef ?? t("inbox.unknown");
          const firstLetter = displayName.slice(0, 1).toUpperCase();
          const isSelected = selectedId === c.conversationId;
          const isAssigned = c.queueStatus === "assigned";

          return (
            <button
              key={c.conversationId}
              type="button"
              onClick={() => onSelectConversation(c.conversationId)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors relative",
                isSelected
                  ? "bg-blue-50 border-l-2 border-blue-600"
                  : "border-l-2 border-transparent hover:bg-slate-50"
              )}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold", tierAvatarClasses(c.customerTier))}>
                  {firstLetter}
                </div>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white",
                  isAssigned ? "bg-emerald-500" : "bg-slate-300"
                )} />
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className={cn("text-sm font-medium truncate", isSelected ? "text-slate-900" : "text-slate-700")}>
                    {displayName}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {listTimestamp(c.lastMessageAt ?? c.occurredAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-xs truncate flex-1", unread > 0 ? "text-slate-700 font-medium" : "text-slate-400")}>
                    {c.lastMessagePreview ?? t("inbox.noMessage")}
                  </span>
                  {unread > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none shrink-0">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                  {c.hasMyOpenTicket && (
                    <span className="text-[11px]" title={t("inbox.myOpenTicket")}>🎫</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {hasMore && <div ref={sentinelRef} className="h-1" />}

        {isLoading && (
          <div className="flex items-center justify-center py-4 text-xs text-slate-400">
            <svg className="animate-spin mr-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            {t("inbox.loading")}
          </div>
        )}
      </div>
    </aside>
  );
}
