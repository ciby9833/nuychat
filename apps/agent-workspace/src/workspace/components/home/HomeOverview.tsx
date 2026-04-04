/**
 * 功能名称: 工作台首页总览
 * 菜单路径: 座席工作台 / 首页
 * 文件职责: 展示未读消息、我的任务和高优任务的总览入口，承接消息页与任务页跳转。
 * 主要交互文件:
 * - ../../pages/DashboardPage.tsx: 负责把首页挂到工作台路由并注入跳转动作。
 * - ../layout/WorkspaceShell.tsx: 提供首页所在的整体工作台壳层。
 * - ../../hooks/useWorkspaceDashboard.ts: 提供未读会话与任务数据。
 */

import { useTranslation } from "react-i18next";

import type { ConversationItem, MyTaskListItem } from "../../types";
import { listTimestamp, shortTime } from "../../utils";
import { cn } from "../../../lib/utils";

type HomeOverviewProps = {
  unreadConversations: ConversationItem[];
  totalUnreadMessages: number;
  myTasks: MyTaskListItem[];
  onOpenConversation: (conversationId: string) => void;
  onOpenTask: (task: MyTaskListItem) => void;
  onOpenMessages: () => void;
  onOpenTasks: () => void;
};

function SummaryCard({
  title,
  value,
  tone,
  onClick,
}: {
  title: string;
  value: string | number;
  tone: "blue" | "slate";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-[28px] border p-5 text-left transition-all",
        "shadow-[0_12px_32px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]",
        tone === "blue"
          ? "border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.98))]"
          : "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))]"
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-4xl font-semibold tracking-tight text-slate-950">{value}</div>
        <div className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors group-hover:text-slate-700">
          →
        </div>
      </div>
    </button>
  );
}

function SectionCard({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-[30px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">{title}</h2>
        <button
          type="button"
          onClick={onAction}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
        >
          {actionLabel}
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function ListButton({
  title,
  meta,
  detail,
  onClick,
}: {
  title: string;
  meta: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[22px] border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{title}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>
        </div>
        <div className="shrink-0 text-[11px] text-slate-400">{meta}</div>
      </div>
    </button>
  );
}

export function HomeOverview(props: HomeOverviewProps) {
  const { unreadConversations, totalUnreadMessages, myTasks, onOpenConversation, onOpenTask, onOpenMessages, onOpenTasks } = props;
  const { t } = useTranslation();

  const urgentTasks = myTasks.filter((task) => task.priority === "urgent" || task.priority === "high");

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] px-6 py-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col">
        <div className="rounded-[34px] border border-white/80 bg-white/78 px-6 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="text-sm font-medium text-slate-500">{t("nav.home")}</div>
          <h1 className="mt-2 text-[34px] font-semibold tracking-tight text-slate-950">{t("home.title")}</h1>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <SummaryCard
              title={t("home.cards.unread")}
              value={totalUnreadMessages}
              tone="blue"
              onClick={onOpenMessages}
            />
            <SummaryCard
              title={t("home.cards.tasks")}
              value={myTasks.length}
              tone="slate"
              onClick={onOpenTasks}
            />
            <SummaryCard
              title={t("home.cards.urgent")}
              value={urgentTasks.length}
              tone="slate"
              onClick={onOpenTasks}
            />
          </div>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard
            title={t("home.unreadSection")}
            actionLabel={t("home.openMessages")}
            onAction={onOpenMessages}
          >
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              {unreadConversations.slice(0, 6).map((conversation) => (
                <ListButton
                  key={conversation.conversationId}
                  title={conversation.customerName ?? conversation.customerRef ?? t("home.unknown")}
                  meta={listTimestamp(conversation.lastMessageAt ?? conversation.occurredAt)}
                  detail={conversation.lastMessagePreview ?? t("home.noMessage")}
                  onClick={() => onOpenConversation(conversation.conversationId)}
                />
              ))}
              {unreadConversations.length === 0 && (
                <div className="flex h-full min-h-[220px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/45 px-4 text-sm text-slate-400">
                  {t("home.emptyUnread")}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={t("home.taskSection")}
            actionLabel={t("home.openTasks")}
            onAction={onOpenTasks}
          >
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              {myTasks.slice(0, 6).map((task) => (
                <ListButton
                  key={task.ticketId}
                  title={task.title}
                  meta={shortTime(task.updatedAt)}
                  detail={[
                    task.customerName ?? task.customerRef ?? t("home.unknown"),
                    task.caseTitle,
                  ].filter(Boolean).join(" · ")}
                  onClick={() => onOpenTask(task)}
                />
              ))}
              {myTasks.length === 0 && (
                <div className="flex h-full min-h-[220px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/45 px-4 text-sm text-slate-400">
                  {t("home.emptyTasks")}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
