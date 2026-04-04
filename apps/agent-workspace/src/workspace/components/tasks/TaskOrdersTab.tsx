import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AgentColleague, CopilotData, Ticket, TicketDetail } from "../../types";
import { shortTime } from "../../utils";
import { TabsContent } from "../../../components/ui/tabs";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-slate-100 bg-slate-50/50 p-3", className)}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-4 first:mt-0">{children}</div>;
}

type CompletionDraft = {
  sendToCustomer: boolean;
  customerReplyBody: string;
};

type TaskOrdersTabProps = {
  currentAgentId: string | null;
  tickets: Ticket[];
  ticketDetailsById: Record<string, TicketDetail>;
  ticketLoading: boolean;
  taskDraft: { sourceMessageId: string | null; sourceMessagePreview: string | null } | null;
  colleagues: AgentColleague[];
  copilot: CopilotData | null;
  onCreateTicket: (input: {
    title: string;
    description?: string;
    priority?: string;
    assigneeId?: string | null;
    dueAt?: string | null;
    sourceMessageId?: string | null;
    requiresCustomerReply?: boolean;
  }) => Promise<void>;
  onPatchTicket: (ticketId: string, input: {
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    dueAt?: string | null;
    requiresCustomerReply?: boolean;
    customerReplyStatus?: "pending" | "sent" | "waived" | null;
    sendCustomerReply?: boolean;
    customerReplyBody?: string | null;
  }) => Promise<void>;
  onAddTicketComment: (ticketId: string, body: string) => Promise<void>;
  onConsumeTaskDraft: () => void;
};

export function TaskOrdersTab(props: TaskOrdersTabProps) {
  const {
    currentAgentId,
    tickets,
    ticketDetailsById,
    ticketLoading,
    taskDraft,
    colleagues,
    copilot,
    onCreateTicket,
    onPatchTicket,
    onAddTicketComment,
    onConsumeTaskDraft
  } = props;

  const { t } = useTranslation();
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketAssigneeId, setTicketAssigneeId] = useState<string>(currentAgentId ?? "");
  const [ticketDueAt, setTicketDueAt] = useState("");
  const [ticketSourceMessageId, setTicketSourceMessageId] = useState<string | null>(null);
  const [ticketSourceMessagePreview, setTicketSourceMessagePreview] = useState<string | null>(null);
  const [ticketRequiresCustomerReply, setTicketRequiresCustomerReply] = useState(false);
  const [ticketFormLoading, setTicketFormLoading] = useState(false);
  const [ticketReplyDrafts, setTicketReplyDrafts] = useState<Record<string, string>>({});
  const [ticketReplyLoadingId, setTicketReplyLoadingId] = useState<string | null>(null);
  const [completionTicketId, setCompletionTicketId] = useState<string | null>(null);
  const [completionDrafts, setCompletionDrafts] = useState<Record<string, CompletionDraft>>({});

  useEffect(() => {
    if (currentAgentId && !ticketAssigneeId) {
      setTicketAssigneeId(currentAgentId);
    }
  }, [currentAgentId, ticketAssigneeId]);

  useEffect(() => {
    if (!taskDraft) return;
    setShowTicketForm(true);
    setTicketSourceMessageId(taskDraft.sourceMessageId ?? null);
    setTicketSourceMessagePreview(taskDraft.sourceMessagePreview ?? null);
    setTicketDesc((current) => current || taskDraft.sourceMessagePreview || "");
    onConsumeTaskDraft();
  }, [onConsumeTaskDraft, taskDraft]);

  const taskStatusLabel = (status: Ticket["status"]): string =>
    t(`rp.orders.status.${status}`, { defaultValue: status });

  const taskStatusVariant = (status: Ticket["status"]): "default" | "success" | "warning" | "danger" | "info" => {
    if (status === "done") return "success";
    if (status === "cancelled") return "default";
    if (status === "in_progress") return "info";
    return "default";
  };

  const customerReplyStatusLabel = (status: Ticket["customerReplyStatus"]) =>
    status ? t(`rp.orders.customerReplyStatus.${status}`) : null;

  const handleCreateTicket = async () => {
    if (!ticketTitle.trim()) return;
    setTicketFormLoading(true);
    try {
      await onCreateTicket({
        title: ticketTitle.trim(),
        description: ticketDesc.trim() || undefined,
        priority: "normal",
        assigneeId: ticketAssigneeId || currentAgentId || null,
        dueAt: ticketDueAt || null,
        sourceMessageId: ticketSourceMessageId,
        requiresCustomerReply: ticketRequiresCustomerReply
      });
      setTicketTitle("");
      setTicketDesc("");
      setTicketAssigneeId(currentAgentId ?? "");
      setTicketDueAt("");
      setTicketSourceMessageId(null);
      setTicketSourceMessagePreview(null);
      setTicketRequiresCustomerReply(false);
      setShowTicketForm(false);
    } finally {
      setTicketFormLoading(false);
    }
  };

  const handleTicketReply = async (ticketId: string) => {
    const body = ticketReplyDrafts[ticketId]?.trim();
    if (!body) return;
    setTicketReplyLoadingId(ticketId);
    try {
      await onAddTicketComment(ticketId, body);
      setTicketReplyDrafts((prev) => ({ ...prev, [ticketId]: "" }));
    } finally {
      setTicketReplyLoadingId(null);
    }
  };

  const openCompletionPrompt = (ticket: Ticket) => {
    setCompletionTicketId(ticket.ticketId);
    setCompletionDrafts((prev) => ({
      ...prev,
      [ticket.ticketId]: prev[ticket.ticketId] ?? {
        sendToCustomer: ticket.requiresCustomerReply && ticket.customerReplyStatus !== "sent",
        customerReplyBody: ""
      }
    }));
  };

  const submitCompletion = async (ticket: Ticket) => {
    const draft = completionDrafts[ticket.ticketId] ?? {
      sendToCustomer: false,
      customerReplyBody: ""
    };
    if (draft.sendToCustomer && !draft.customerReplyBody.trim()) return;

    await onPatchTicket(ticket.ticketId, {
      status: "done",
      requiresCustomerReply: ticket.requiresCustomerReply || draft.sendToCustomer,
      customerReplyStatus: draft.sendToCustomer
        ? "pending"
        : ticket.requiresCustomerReply && ticket.customerReplyStatus !== "sent"
          ? "waived"
          : ticket.customerReplyStatus,
      sendCustomerReply: draft.sendToCustomer,
      customerReplyBody: draft.sendToCustomer ? draft.customerReplyBody.trim() : null
    });
    setCompletionTicketId(null);
  };

  return (
    <TabsContent value="orders" className="flex-1 overflow-y-auto p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("rp.orders.title")}</span>
        <Button
          variant={showTicketForm ? "ghost" : "outline"}
          size="sm"
          onClick={() => setShowTicketForm((v) => !v)}
        >
          {showTicketForm ? t("rp.orders.cancelCreate") : t("rp.orders.create")}
        </Button>
      </div>

      {showTicketForm && (
        <Card className="mb-3">
          {ticketSourceMessagePreview && (
            <div className="text-[11px] text-slate-500 bg-blue-50 rounded-md px-2 py-1.5 mb-2 border border-blue-100">
              {t("rp.orders.quotedMsg", { preview: ticketSourceMessagePreview })}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder={t("rp.orders.titlePlaceholder")}
              value={ticketTitle}
              onChange={(e) => setTicketTitle(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <textarea
              placeholder={t("rp.orders.descPlaceholder")}
              value={ticketDesc}
              onChange={(e) => setTicketDesc(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-h-[64px] resize-none"
            />
            <select
              value={ticketAssigneeId}
              onChange={(e) => setTicketAssigneeId(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {currentAgentId && <option value={currentAgentId}>{t("rp.orders.assigneeMe")}</option>}
              <option value="">{t("rp.orders.assigneePlaceholder")}</option>
              {colleagues.map((item) => (
                <option key={item.agentId} value={item.agentId}>
                  {item.displayName}{item.employeeNo ? ` #${item.employeeNo}` : ""}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={ticketDueAt}
              onChange={(e) => setTicketDueAt(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={ticketRequiresCustomerReply}
                onChange={(e) => setTicketRequiresCustomerReply(e.target.checked)}
              />
              <span>{t("rp.orders.requiresCustomerReply")}</span>
            </label>
            <Button
              variant="primary"
              size="md"
              disabled={ticketFormLoading || !ticketTitle.trim()}
              onClick={() => void handleCreateTicket()}
              className="w-full"
            >
              {ticketFormLoading ? t("rp.orders.creating") : t("rp.orders.confirm")}
            </Button>
          </div>
        </Card>
      )}

      {(copilot?.entities.orderIds ?? []).length > 0 && (
        <>
          <SectionTitle>{t("rp.orders.orderMarks")}</SectionTitle>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(copilot?.entities.orderIds ?? []).map((id) => (
              <Badge key={id} variant="outline">{id}</Badge>
            ))}
          </div>
        </>
      )}

      {ticketLoading && <p className="text-xs text-slate-400">{t("rp.orders.loading")}</p>}
      {!ticketLoading && tickets.length === 0 && <p className="text-xs text-slate-400">{t("rp.orders.empty")}</p>}

      <div className="flex flex-col gap-2">
        {tickets.map((ticket) => (
          <Card key={ticket.ticketId}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800 mb-1">{ticket.title}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={taskStatusVariant(ticket.status)}>{taskStatusLabel(ticket.status)}</Badge>
                  {ticket.requiresCustomerReply && customerReplyStatusLabel(ticket.customerReplyStatus) && (
                    <Badge variant={ticket.customerReplyStatus === "sent" ? "success" : ticket.customerReplyStatus === "waived" ? "default" : "warning"}>
                      {customerReplyStatusLabel(ticket.customerReplyStatus)}
                    </Badge>
                  )}
                  {ticket.assigneeName && (
                    <span className="text-[10px] text-slate-400">
                      {ticket.assigneeName}{ticket.assigneeEmployeeNo ? ` #${ticket.assigneeEmployeeNo}` : ""}
                    </span>
                  )}
                  {ticket.slaDeadlineAt && (
                    <span className="text-[10px] text-slate-400">
                      {t("rp.orders.dueAt", { time: shortTime(ticket.slaDeadlineAt) })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {ticket.status === "open" && (
                  <Button variant="outline" size="sm" onClick={() => void onPatchTicket(ticket.ticketId, { status: "in_progress" })}>
                    {t("rp.orders.start")}
                  </Button>
                    )}
                    {ticket.status !== "done" && ticket.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (ticket.requiresCustomerReply && ticket.customerReplyStatus !== "sent") {
                            openCompletionPrompt(ticket);
                            return;
                          }
                          void onPatchTicket(ticket.ticketId, { status: "done" });
                        }}
                      >
                        {ticket.requiresCustomerReply && ticket.customerReplyStatus !== "sent"
                          ? t("rp.orders.doneWithReply")
                          : t("rp.orders.done")}
                  </Button>
                )}
              </div>
            </div>
            {ticket.description && <p className="text-[11px] text-slate-500 mb-1">{ticket.description}</p>}
            {ticket.sourceMessagePreview && (
              <p className="text-[11px] text-slate-400 italic mb-1">{t("rp.orders.quoted", { preview: ticket.sourceMessagePreview })}</p>
            )}
            {(ticketDetailsById[ticket.ticketId]?.comments?.length ?? 0) > 0 && (
              <div className="mt-2 rounded-md border border-slate-100 bg-white/80 p-2">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("rp.orders.replies")}
                </div>
                <div className="flex flex-col gap-2">
                  {ticketDetailsById[ticket.ticketId].comments.map((comment) => (
                    <div key={comment.noteId} className="rounded-md bg-slate-50 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-700">
                          {comment.authorName || comment.authorType}
                          {comment.authorEmployeeNo ? ` #${comment.authorEmployeeNo}` : ""}
                        </span>
                        <span className="text-[10px] text-slate-400">{shortTime(comment.createdAt)}</span>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">
                        {comment.body}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {completionTicketId === ticket.ticketId && (
              <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/70 p-3">
                {ticket.requiresCustomerReply && ticket.customerReplyStatus !== "sent" ? (
                  <label className="mb-2 flex items-center gap-2 text-[12px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={completionDrafts[ticket.ticketId]?.sendToCustomer ?? true}
                      onChange={(e) => setCompletionDrafts((prev) => ({
                        ...prev,
                        [ticket.ticketId]: {
                          sendToCustomer: e.target.checked,
                          customerReplyBody: prev[ticket.ticketId]?.customerReplyBody ?? ""
                        }
                      }))}
                    />
                    <span>{t("rp.orders.sendResultToCustomer")}</span>
                  </label>
                ) : null}
                {(completionDrafts[ticket.ticketId]?.sendToCustomer ?? false) && (
                  <textarea
                    value={completionDrafts[ticket.ticketId]?.customerReplyBody ?? ""}
                    onChange={(e) => setCompletionDrafts((prev) => ({
                      ...prev,
                      [ticket.ticketId]: {
                        sendToCustomer: prev[ticket.ticketId]?.sendToCustomer ?? true,
                        customerReplyBody: e.target.value
                      }
                    }))}
                    placeholder={t("rp.orders.customerReplyPlaceholder")}
                    className="min-h-[72px] w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCompletionTicketId(null)}>
                    {t("rp.orders.cancelCompletion")}
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => void submitCompletion(ticket)}>
                    {t("rp.orders.confirmCompletion")}
                  </Button>
                </div>
              </div>
            )}
            {ticket.status !== "cancelled" && (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={ticketReplyDrafts[ticket.ticketId] ?? ""}
                  onChange={(e) => setTicketReplyDrafts((prev) => ({ ...prev, [ticket.ticketId]: e.target.value }))}
                  placeholder={t("rp.orders.replyPlaceholder")}
                  className="min-h-[64px] resize-none rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ticketReplyLoadingId === ticket.ticketId || !(ticketReplyDrafts[ticket.ticketId] ?? "").trim()}
                    onClick={() => void handleTicketReply(ticket.ticketId)}
                  >
                    {ticketReplyLoadingId === ticket.ticketId ? t("rp.orders.replySaving") : t("rp.orders.replyAction")}
                  </Button>
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-400">{t("rp.orders.createdAt", { time: shortTime(ticket.createdAt) })}</p>
          </Card>
        ))}
      </div>
    </TabsContent>
  );
}
