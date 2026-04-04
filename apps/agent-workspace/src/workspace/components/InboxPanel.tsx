import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  ConversationItem,
  ConversationListItem,
  ConversationViewSummaries,
  LeftPanelMode,
  MyTaskListItem,
  SideView
} from "../types";
import { dateGroupLabel, listTimestamp } from "../utils";
import { cn } from "../../lib/utils";

type TierFilter = "all" | "vip" | "premium" | "standard";

type InboxPanelProps = {
  showModeSwitch?: boolean;
  leftPanelMode: LeftPanelMode;
  view: SideView;
  tierFilter: TierFilter;
  searchText: string;
  taskSearchText: string;
  filteredConversations: ConversationItem[];
  filteredMyTasks: MyTaskListItem[];
  viewSummaries: ConversationViewSummaries;
  selectedId: string | null;
  hasMore: boolean;
  isLoading: boolean;
  taskLoading: boolean;
  onLeftPanelModeChange: (mode: LeftPanelMode) => void;
  onViewChange: (v: SideView) => void;
  onTierFilterChange: (v: TierFilter) => void;
  onSearchTextChange: (v: string) => void;
  onTaskSearchTextChange: (v: string) => void;
  onSelectConversation: (id: string) => void;
  onSelectTask: (task: MyTaskListItem) => void;
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
    showModeSwitch = true,
    leftPanelMode,
    view,
    tierFilter,
    searchText,
    taskSearchText,
    filteredConversations,
    filteredMyTasks,
    viewSummaries,
    selectedId,
    hasMore,
    isLoading,
    taskLoading,
    onLeftPanelModeChange,
    onViewChange,
    onTierFilterChange,
    onSearchTextChange,
    onTaskSearchTextChange,
    onSelectConversation,
    onSelectTask,
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
  const isTaskMode = leftPanelMode === "tasks";

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
  const PANEL_MODE_KEYS = ["conversations", "tasks"] as const;

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-transparent">
      {/* Header section */}
      <div className="flex flex-col gap-0 border-b border-slate-100 bg-transparent px-2 pt-2">
        {showModeSwitch && (
          <div className="px-2 pt-2">
            <div className="inline-flex rounded-xl bg-slate-100/90 p-1">
              {PANEL_MODE_KEYS.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onLeftPanelModeChange(mode)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    leftPanelMode === mode
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {t(`inbox.mode.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isTaskMode && (
          <div className="flex items-center gap-1 px-2 pt-2">
            {VIEW_KEYS.map((v) => {
              const unread = viewSummaries[v]?.unreadMessages ?? 0;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onViewChange(v)}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    view === v
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  )}
                >
                  {t(`inbox.views.${v}`)}
                  {unread > 0 && (
                    <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold leading-none text-white">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="px-2 py-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={isTaskMode ? taskSearchText : searchText}
              onChange={(e) => (
                isTaskMode
                  ? onTaskSearchTextChange(e.target.value)
                  : onSearchTextChange(e.target.value)
              )}
              placeholder={t(isTaskMode ? "inbox.taskSearch" : "inbox.search")}
            />
          </div>
        </div>

        {!isTaskMode && !isFollowUpView && (
          <div className="flex flex-wrap items-center gap-1 px-2 pb-2.5">
            {TIER_KEYS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTierFilterChange(tag)}
                className={cn(
                  "h-6 rounded-full px-2.5 text-[10px] font-semibold transition-colors",
                  tierFilter === tag
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {t(`inbox.tier.${tag}`)}
              </button>
            ))}
          </div>
        )}

        {!isTaskMode && isFollowUpView && (
          <div className="mx-2 mb-2.5 flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[11px] text-slate-600">
            <span>📋</span>
            <span>{t("inbox.followUpHint")}</span>
          </div>
        )}

        {isTaskMode && (
          <div className="mx-2 mb-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            {t("inbox.tasksHint")}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isTaskMode && filteredMyTasks.length === 0 && !taskLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <p className="text-xs">{t("inbox.tasksEmpty")}</p>
          </div>
        )}

        {!isTaskMode && filteredConversations.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-xs">{t("inbox.empty")}</p>
          </div>
        )}

        {isTaskMode && filteredMyTasks.map((task) => {
          const displayName = task.customerName ?? task.customerRef ?? t("inbox.unknown");
          const latestPreview = task.conversationLastMessagePreview ?? task.sourceMessagePreview ?? task.description ?? t("inbox.noMessage");
          return (
            <button
              key={task.ticketId}
              type="button"
              onClick={() => onSelectTask(task)}
              className="mb-2 w-full rounded-2xl border border-transparent bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-slate-200 hover:bg-slate-50"
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{task.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">
                    {displayName}
                    {task.caseTitle ? ` · ${task.caseTitle}` : ""}
                  </div>
                </div>
                <span className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  task.status === "open" && "bg-amber-100 text-amber-700",
                  task.status === "in_progress" && "bg-blue-100 text-blue-700",
                  task.status === "done" && "bg-emerald-100 text-emerald-700",
                  task.status === "cancelled" && "bg-slate-100 text-slate-500"
                )}>
                  {t(`rp.orders.status.${task.status}`)}
                </span>
              </div>
              <div className="mb-2 line-clamp-2 text-xs leading-5 text-slate-600">
                {latestPreview}
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="truncate">
                  {task.conversationStatus ? t(`utils.convStatus.${task.conversationStatus}`) : t("inbox.mode.conversations")}
                  {task.channelType ? ` · ${task.channelType}` : ""}
                </span>
                <span className="shrink-0">
                  {task.slaDeadlineAt
                    ? t("inbox.taskDue", { time: listTimestamp(task.slaDeadlineAt) })
                    : t("inbox.taskUpdated", { time: listTimestamp(task.updatedAt) })}
                </span>
              </div>
            </button>
          );
        })}

        {!isTaskMode && listItems.map((item, idx) => {
          if (item.kind === "header") {
            return (
              <div key={`header-${item.label}-${idx}`} className="sticky top-0 z-[1] bg-[rgba(244,247,251,0.92)] px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 backdrop-blur-sm">
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
                "relative mb-2 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                isSelected
                  ? "border-blue-200 bg-blue-50/80 shadow-sm"
                  : "border-transparent bg-white shadow-sm hover:border-slate-200 hover:bg-slate-50"
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
                    <span className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold leading-none text-white">
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

        {!isTaskMode && hasMore && <div ref={sentinelRef} className="h-1" />}

        {(isTaskMode ? taskLoading : isLoading) && (
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
