/**
 * 功能名称: 会话头部与会话操作栏
 * 菜单路径: 座席工作台 / 消息 / 会话详情头部
 * 文件职责: 展示客户信息、会话状态，并承载认领、转派、挂起、完结等会话级操作与提示条。
 * 交互页面:
 * - ./MessagesWorkspace.tsx: 消息工作台页面，承载完整三栏消息布局。
 * - ../TimelinePanel.tsx: 作为消息中间列的头部区域被编排和驱动。
 * - ../../hooks/useWorkspaceDashboard.ts: 提供会话详情、同事列表与会话动作。
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AgentColleague, ConversationDetail, Ticket } from "../../types";
import { cn } from "../../../lib/utils";

type ConversationHeaderProps = {
  detail: ConversationDetail | null;
  viewHint: string;
  isAssignedToMe: boolean;
  actionLoading: string | null;
  tickets: Ticket[];
  colleagues: AgentColleague[];
  onAssign: () => Promise<void>;
  onHandoff: () => Promise<void>;
  onTransfer: (targetAgentId: string, reason?: string) => Promise<void>;
  onResolve: () => Promise<void>;
};

export function ConversationHeader(props: ConversationHeaderProps) {
  const {
    detail,
    viewHint,
    isAssignedToMe,
    actionLoading,
    tickets,
    colleagues,
    onAssign,
    onHandoff,
    onTransfer,
    onResolve
  } = props;

  const { t } = useTranslation();
  const [resolveConfirm, setResolveConfirm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const openTickets = useMemo(
    () => tickets.filter((ticket) => !["done", "cancelled"].includes(ticket.status)),
    [tickets]
  );
  const isResolved = detail?.status === "resolved" || detail?.status === "closed";
  const isLockedByAnotherAgent = Boolean(detail && !isAssignedToMe && detail.status === "human_active");
  const hintType = viewHint.startsWith("🔴") ? "error" : viewHint.startsWith("⚠️") ? "warning" : "info";

  const sortedColleagues = useMemo(() => {
    return [...colleagues].sort((a, b) => {
      const aOnline = a.status === "online" || a.status === "busy" ? 0 : 1;
      const bOnline = b.status === "online" || b.status === "busy" ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });
  }, [colleagues]);

  const handleResolveClick = () => {
    if (openTickets.length > 0) {
      setResolveConfirm(true);
      return;
    }
    void onResolve();
  };

  const handleTransferConfirm = () => {
    if (!transferTargetId) return;
    setShowTransfer(false);
    void onTransfer(transferTargetId, transferReason || undefined);
    setTransferTargetId("");
    setTransferReason("");
  };

  return (
    <>
      <div className="shrink-0 border-b border-slate-100 bg-white/80 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
        {detail ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">
                {(detail.customerName ?? detail.customerRef ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {detail.customerName ?? detail.customerRef}
                </div>
                <div className="truncate text-xs text-slate-400">
                  {detail.customerRef} · {detail.customerLanguage} · {detail.channelType} · {detail.operatingMode}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {!isAssignedToMe && detail.status !== "resolved" && (
                <button
                  type="button"
                  onClick={() => void onAssign()}
                  disabled={actionLoading !== null}
                  className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {actionLoading === "assign" ? t("timeline.processing") : t("timeline.assign")}
                </button>
              )}
              {isAssignedToMe && detail.status !== "resolved" && (
                <>
                  <button
                    type="button"
                    onClick={() => void onHandoff()}
                    disabled={actionLoading !== null}
                    className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    {actionLoading === "handoff" ? t("timeline.processing") : t("timeline.handoff")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTransfer((value) => !value)}
                    disabled={actionLoading !== null}
                    className={cn(
                      "h-8 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-50",
                      showTransfer
                        ? "border border-blue-200 bg-blue-50 text-blue-700"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {actionLoading === "transfer" ? t("timeline.transferring") : t("timeline.transfer")}
                  </button>
                </>
              )}
              {detail.status !== "resolved" && (
                <button
                  type="button"
                  onClick={handleResolveClick}
                  disabled={actionLoading !== null}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-50",
                    resolveConfirm
                      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      : "bg-slate-900 text-white shadow-sm hover:bg-slate-800"
                  )}
                >
                  {actionLoading === "resolve" ? t("timeline.processing") : t("timeline.resolve")}
                </button>
              )}
              {isResolved && (
                <span className="inline-flex h-8 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700">
                  ✓ {t("timeline.resolved")}
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="text-sm text-slate-400">{t("timeline.selectConversation")}</span>
        )}
        </div>
      </div>

      {showTransfer && (
        <div className="mx-5 mt-3 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-slate-700">{t("timeline.transferTitle")}</div>
          <div className="flex flex-col gap-2">
            <select
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
            >
              <option value="">{t("timeline.selectAgent")}</option>
              {sortedColleagues.map((colleague) => {
                const isOnline = colleague.status === "online" || colleague.status === "busy";
                const label = `${colleague.displayName ?? t("msgList.unknown")}${colleague.employeeNo ? ` #${colleague.employeeNo}` : ""} ${isOnline ? "🟢" : "⚪"}`;
                return (
                  <option key={colleague.agentId} value={colleague.agentId}>
                    {label}
                  </option>
                );
              })}
            </select>
            <input
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder={t("timeline.transferNote")}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTransferConfirm}
                disabled={!transferTargetId}
                className="h-7 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {t("timeline.confirmTransfer")}
              </button>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                className="h-7 rounded-md bg-slate-100 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
              >
                {t("timeline.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewHint && (
        <div
          className={cn(
            "mx-5 mt-3 flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium",
            hintType === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : hintType === "warning"
                ? "border border-amber-200 bg-amber-50 text-amber-700"
                : "border border-blue-200 bg-blue-50 text-blue-700"
          )}
        >
          {viewHint}
        </div>
      )}

      {isLockedByAnotherAgent && (
        <div className="mx-5 mt-3 flex shrink-0 items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          ⚠️ {t("timeline.lockedBanner")}
        </div>
      )}

      {resolveConfirm && (
        <div className="mx-5 mt-3 flex shrink-0 items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="flex-1 text-xs text-amber-700">
            {t("timeline.resolveBanner", { count: openTickets.length })}
          </span>
          <button
            type="button"
            onClick={() => {
              setResolveConfirm(false);
              void onResolve();
            }}
            className="h-7 rounded-md bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700"
          >
            {t("timeline.endConversation")}
          </button>
          <button
            type="button"
            onClick={() => setResolveConfirm(false)}
            className="h-7 rounded-md bg-slate-100 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
          >
            {t("timeline.cancel")}
          </button>
        </div>
      )}
    </>
  );
}
