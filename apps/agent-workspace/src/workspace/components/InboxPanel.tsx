import { useEffect, useMemo, useRef } from "react";
import type { ConversationItem, ConversationListItem, SideView } from "../types";
import { dateGroupLabel, listTimestamp } from "../utils";

type TierFilter = "all" | "vip" | "premium" | "standard";

type InboxPanelProps = {
  view: SideView;
  tierFilter: TierFilter;
  searchText: string;
  filteredConversations: ConversationItem[];
  selectedId: string | null;
  hasMore: boolean;
  isLoading: boolean;
  onViewChange: (v: SideView) => void;
  onTierFilterChange: (v: TierFilter) => void;
  onSearchTextChange: (v: string) => void;
  onSelectConversation: (id: string) => void;
  onLoadMore: () => void;
};

const TIER_LABELS: Record<string, string> = {
  all: "全部",
  vip: "VIP",
  premium: "高级",
  standard: "标准"
};

function avatarTierClass(tier: string | undefined): string {
  const t = (tier ?? "standard").toLowerCase();
  if (t === "vip") return "tier-vip";
  if (t === "premium") return "tier-premium";
  return "tier-standard";
}

export function InboxPanel(props: InboxPanelProps) {
  const {
    view,
    tierFilter,
    searchText,
    filteredConversations,
    selectedId,
    hasMore,
    isLoading,
    onViewChange,
    onTierFilterChange,
    onSearchTextChange,
    onSelectConversation,
    onLoadMore
  } = props;

  // IntersectionObserver for infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const isFollowUpView = view === "follow_up";

  // Build flat list with date group headers using useMemo
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

  return (
    <aside className="inbox-panel">
      {/* View switch + filters */}
      <div className="inbox-head">
        <div className="inbox-view-switch">
          {(["all", "mine", "follow_up"] as const).map((v) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => onViewChange(v)}
            >
              {v === "all" ? "全部"
                : v === "mine" ? "我的"
                : "跟进"}
            </button>
          ))}
        </div>

        <input
          className="inbox-search"
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          placeholder="搜索客户、消息…"
        />

        {/* Tier filter hidden in monitor/follow_up views (not relevant) */}
        {!isFollowUpView && (
          <div className="inbox-tier-row">
            {(["all", "vip", "premium", "standard"] as const).map((tag) => (
              <button
                key={tag}
                className={tierFilter === tag ? "active" : ""}
                onClick={() => onTierFilterChange(tag)}
              >
                {TIER_LABELS[tag]}
              </button>
            ))}
          </div>
        )}

        {isFollowUpView && (
          <div className="inbox-monitor-hint">
            📋 含开放工单的会话 — 点击进入继续跟进处理
          </div>
        )}
      </div>

      {/* Scrollable conversation list */}
      <div className="inbox-list">
        {filteredConversations.length === 0 && !isLoading && (
          <p className="inbox-empty">
            {"暂无会话"}
          </p>
        )}

        {listItems.map((item, idx) => {
          if (item.kind === "header") {
            return (
              <div key={`header-${item.label}-${idx}`} className="inbox-date-header">
                {item.label}
              </div>
            );
          }

          const c = item.data;
          const unread = c.unreadCount ?? 0;
          const displayName = c.customerName ?? c.customerRef ?? "未知客户";
          const firstLetter = displayName.slice(0, 1).toUpperCase();
          const isSelected = selectedId === c.conversationId;
          const isAssigned = c.queueStatus === "assigned";

          return (
            <button
              key={c.conversationId}
              type="button"
              className={`inbox-item${isSelected ? " selected" : ""}`}
              onClick={() => onSelectConversation(c.conversationId)}
            >
              <div className="inbox-avatar-wrap">
                <div className={`inbox-avatar ${avatarTierClass(c.customerTier)}`}>
                  {firstLetter}
                </div>
                <span className={`inbox-avatar-status${isAssigned ? " assigned" : ""}`} />
              </div>

              <div className="inbox-item-body">
                <div className="inbox-item-row1">
                  <span className="inbox-item-name">{displayName}</span>
                    <span className="inbox-item-time">{listTimestamp(c.lastMessageAt ?? c.occurredAt)}</span>
                </div>
                <div className="inbox-item-row2">
                  <span className={`inbox-item-preview${unread > 0 ? " has-unread" : ""}`}>
                    {c.lastMessagePreview ?? "(暂无消息)"}
                  </span>
                  {unread > 0 && (
                    <span className="inbox-unread-badge">{unread > 99 ? "99+" : unread}</span>
                  )}
                  {c.hasMyOpenTicket && (
                    <span className="inbox-ticket-badge" title="有我负责的开放工单">🎫</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {/* Infinite scroll sentinel (not needed in monitor view since list is bounded) */}
        {hasMore && (
          <div ref={sentinelRef} className="inbox-sentinel" />
        )}

        {isLoading && (
          <div className="inbox-loading">加载中…</div>
        )}
      </div>
    </aside>
  );
}
