import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AVAILABLE_SKILLS } from "../constants";
import type {
  AiTrace,
  AgentColleague,
  ConversationDetail,
  ConversationSkillRecommendationResponse,
  CopilotData,
  Customer360Data,
  RightTab,
  SkillExecuteResult,
  SkillSchema,
  TicketDetail,
  Ticket
} from "../types";
import { intentLabel, sentimentLabel, shortTime } from "../utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { TaskOrdersTab } from "./tasks/TaskOrdersTab";

function titleCaseLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function cleanupReadableText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\[[^\]]+\]\s*\|/g, "")
    .replace(/\s*\|\s*detail=/gi, "。说明：")
    .replace(/\s*\|\s*/g, "。")
    .replace(/\bdetail=/gi, "说明：")
    .replace(/\btitle=/gi, "标题：")
    .replace(/\bsummary=/gi, "")
    .replace(/\s+/g, " ")
    .replace(/。{2,}/g, "。")
    .trim();
}

function splitReadableParagraphs(value: string | null | undefined): string[] {
  const cleaned = cleanupReadableText(value);
  if (!cleaned) return [];
  return cleaned
    .split(/\n+|(?<=[。！？])\s+|(?<=\.)\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatStatePayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload)
    .map(([key, raw]) => {
      if (raw === null || raw === undefined || raw === "") return null;
      const value = Array.isArray(raw)
        ? raw.join("、")
        : typeof raw === "object"
          ? JSON.stringify(raw)
          : String(raw);
      return `${titleCaseLabel(key)}: ${value}`;
    })
    .filter((item): item is string => Boolean(item));
  return entries.join(" · ");
}

function compactReadableText(value: string | null | undefined, fallback = ""): string {
  const firstLine = splitReadableParagraphs(value)[0];
  return firstLine ?? fallback;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type RightPanelProps = {
  currentAgentId: string | null;
  rightTab: RightTab;
  detail: ConversationDetail | null;
  copilot: CopilotData | null;
  aiTraces: AiTrace[];
  skillRecommendation: ConversationSkillRecommendationResponse | null;
  skillSchemas: SkillSchema[];
  tickets: Ticket[];
  ticketDetailsById: Record<string, TicketDetail>;
  ticketLoading: boolean;
  taskDraft: { sourceMessageId: string | null; sourceMessagePreview: string | null } | null;
  colleagues: AgentColleague[];
  skillExecuting: string | null;
  lastSkillResult: SkillExecuteResult | null;
  customer360: Customer360Data | null;
  onTabChange: (tab: RightTab) => void;
  onSelectConversation: (id: string) => void;
  onApplyTopRecommendedSkills: () => void;
  onSetPreferredSkills: (skills: string[]) => void;
  onCreateTicket: (input: { title: string; description?: string; priority?: string; assigneeId?: string | null; dueAt?: string | null; sourceMessageId?: string | null; requiresCustomerReply?: boolean }) => Promise<void>;
  onPatchTicket: (ticketId: string, input: { status?: string; priority?: string; assigneeId?: string | null; dueAt?: string | null; requiresCustomerReply?: boolean; customerReplyStatus?: "pending" | "sent" | "waived" | null; sendCustomerReply?: boolean; customerReplyBody?: string | null }) => Promise<void>;
  onAddTicketComment: (ticketId: string, body: string) => Promise<void>;
  onConsumeTaskDraft: () => void;
  onExecuteSkill: (skillName: string, parameters: Record<string, unknown>) => Promise<void>;
};

// ─── Skill parameter form ─────────────────────────────────────────────────────

type ParamFormProps = {
  schema: SkillSchema;
  executing: boolean;
  onExecute: (params: Record<string, unknown>) => void;
  onCancel: () => void;
};

function SkillParamForm({ schema, executing, onExecute, onCancel }: ParamFormProps) {
  const { t } = useTranslation();
  const props = schema.parameters?.properties ?? {};
  const required = schema.parameters?.required ?? [];
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const defaults: Record<string, string | number | boolean> = {};
    for (const [k, def] of Object.entries(props)) {
      if (def.enum && def.enum.length > 0) defaults[k] = def.enum[0];
    }
    return defaults;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleExecute = () => {
    const missing = required.filter((k) => {
      const v = valuesRef.current[k];
      return v === undefined || v === "" || v === null;
    });
    if (missing.length > 0) { setErrors(missing); return; }
    setErrors([]);
    onExecute(valuesRef.current as Record<string, unknown>);
  };

  return (
    <div className="flex flex-col gap-2 mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
      {Object.entries(props).map(([key, def]) => {
        const isRequired = required.includes(key);
        const hasError = errors.includes(key);
        const cur = values[key];
        return (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-600">
              {key}{isRequired ? <span className="text-red-500 ml-0.5">*</span> : ""}
              {def.description ? <span className="text-slate-400 ml-1">{def.description.slice(0, 40)}</span> : null}
            </label>
            {def.enum ? (
              <select
                className={cn("h-7 rounded-md border bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500/50", hasError ? "border-red-300" : "border-slate-200")}
                value={cur as string ?? ""}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: e.target.value })); setErrors((p) => p.filter((x) => x !== key)); }}
              >
                {def.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : def.type === "boolean" ? (
              <select
                className={cn("h-7 rounded-md border bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500/50", hasError ? "border-red-300" : "border-slate-200")}
                value={cur === undefined ? "" : String(cur)}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: e.target.value === "true" })); setErrors((p) => p.filter((x) => x !== key)); }}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (def.type === "number" || def.type === "integer") ? (
              <input
                type="number"
                className={cn("h-7 rounded-md border bg-white px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/50", hasError ? "border-red-300" : "border-slate-200")}
                value={cur as number ?? ""}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: Number(e.target.value) })); setErrors((p) => p.filter((x) => x !== key)); }}
                placeholder={def.description ?? key}
              />
            ) : (
              <input
                type="text"
                className={cn("h-7 rounded-md border bg-white px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/50", hasError ? "border-red-300" : "border-slate-200")}
                value={cur as string ?? ""}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: e.target.value })); setErrors((p) => p.filter((x) => x !== key)); }}
                placeholder={def.description ?? key}
              />
            )}
            {hasError && <div className="text-[10px] text-red-500">{t("rp.skills.required")}</div>}
          </div>
        );
      })}
      <div className="flex gap-2 mt-1">
        <Button variant="primary" size="sm" disabled={executing} onClick={handleExecute}>
          {executing ? t("rp.skills.executing") : t("rp.skills.confirm")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>{t("rp.skills.cancelParam")}</Button>
      </div>
    </div>
  );
}

// ─── Shared card style ────────────────────────────────────────────────────────

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

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RightPanel(props: RightPanelProps) {
  const {
    currentAgentId,
    rightTab,
    detail,
    copilot,
    aiTraces,
    skillRecommendation,
    skillSchemas,
    tickets,
    ticketDetailsById,
    ticketLoading,
    taskDraft,
    colleagues,
    skillExecuting,
    lastSkillResult,
    customer360,
    onTabChange,
    onSelectConversation,
    onApplyTopRecommendedSkills,
    onSetPreferredSkills,
    onCreateTicket,
    onPatchTicket,
    onAddTicketComment,
    onConsumeTaskDraft,
    onExecuteSkill
  } = props;

  const { t } = useTranslation();
  const [c360Tab, setC360Tab] = useState<"base" | "history" | "orders" | "analysis">("base");
  const [paramSkillName, setParamSkillName] = useState<string | null>(null);
  const sentimentBars = (customer360?.sentimentTrend ?? []).map((item) => {
    const s = item.sentiment.toLowerCase();
    const score = s === "positive" ? 5 : s === "neutral" ? 3 : s === "negative" ? 2 : 1;
    return `${new Date(item.occurredAt).toLocaleDateString()} ${"★".repeat(score)}${"☆".repeat(5 - score)}`;
  });

  const customerAnalysisLines = splitReadableParagraphs(customer360?.aiAnalysis.summary);
  const topMemoryItems = (customer360?.memoryItems ?? []).slice(0, 4);
  const topStateSnapshots = (customer360?.stateSnapshots ?? []).slice(0, 4);
  const topKnowledgeRecommendations = (customer360?.knowledgeRecommendations ?? []).slice(0, 4);

  const memoryTypeLabel = (memoryType: string): string =>
    t(`rp.memoryType.${memoryType}`, { defaultValue: titleCaseLabel(memoryType) });

  const taskStatusLabel = (status: Ticket["status"]): string => t(`rp.orders.status.${status}`, { defaultValue: status });

  const TABS: Array<{ key: RightTab; label: string }> = [
    { key: "case",     label: t("rp.tabs.case") },
    { key: "customer", label: t("rp.tabs.customer") },
    { key: "copilot",  label: t("rp.tabs.copilot") },
    { key: "skills",   label: t("rp.tabs.skills") },
    { key: "orders",   label: t("rp.tabs.orders") }
  ];

  return (
    <aside
      className="flex flex-col overflow-hidden bg-white border-l border-slate-200"
      style={{ gridColumn: 4, gridRow: 2 }}
    >
      {/* Tab bar */}
      <Tabs
        value={rightTab}
        onValueChange={(v) => onTabChange(v as RightTab)}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <TabsList className="shrink-0">
          {TABS.map(({ key, label }) => (
            <TabsTrigger key={key} value={key} className="relative">
              {label}
              {key === "orders" && tickets.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center h-3.5 min-w-[14px] px-0.5 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none">
                  {tickets.length > 9 ? "9+" : tickets.length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Case ── */}
        <TabsContent value="case" className="flex-1 overflow-y-auto p-3">
          {!detail?.caseId ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p className="text-xs">{t("rp.case.empty")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              <Card>
                <KVRow label={t("rp.case.id")} value={<code className="text-xs bg-slate-100 px-1 rounded">{detail.caseId.slice(0, 8)}</code>} />
                <KVRow label={t("rp.case.status")} value={detail.caseStatus ?? "-"} />
                <KVRow label={t("rp.case.type")} value={detail.caseType ?? "-"} />
                <KVRow label={t("rp.case.title")} value={detail.caseTitle ?? "-"} />
                <KVRow label={t("rp.case.openedAt")} value={detail.caseOpenedAt ? shortTime(detail.caseOpenedAt) : "-"} />
                <KVRow label={t("rp.case.lastActivity")} value={detail.caseLastActivityAt ? shortTime(detail.caseLastActivityAt) : "-"} />
              </Card>
              <SectionTitle>{t("rp.case.summary")}</SectionTitle>
              <Card className="text-xs text-slate-700 leading-relaxed">
                {detail.caseSummary || t("rp.case.noSummary")}
              </Card>
              <SectionTitle>{t("rp.case.tasks")}</SectionTitle>
              {tickets.length === 0 ? (
                <p className="text-xs text-slate-400">{t("rp.case.noTasks")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tickets.map((ticket) => (
                    <Badge key={ticket.ticketId} variant="outline" className="text-[10px]">
                      {ticket.title} · {taskStatusLabel(ticket.status)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Customer 360 ── */}
        <TabsContent value="customer" className="flex-1 overflow-y-auto p-3">
          {/* Sub-tabs */}
          <div className="flex items-center gap-1 mb-3">
            {(["base", "history", "orders", "analysis"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setC360Tab(tab)}
                className={cn(
                  "h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors",
                  c360Tab === tab ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {t(`rp.customer.tabs.${tab}`)}
              </button>
            ))}
          </div>

          {c360Tab === "base" && (
            <div>
              <Card>
                <KVRow label={t("rp.customer.name")} value={customer360?.customer.name ?? detail?.customerName ?? "-"} />
                <KVRow label={t("rp.customer.customerId")} value={customer360?.customer.reference ?? detail?.customerRef ?? "-"} />
                <KVRow label={t("rp.customer.tier")} value={(customer360?.customer.tier ?? detail?.customerTier ?? "standard").toUpperCase()} />
                <KVRow label={t("rp.customer.channel")} value={customer360?.customer.channelType ?? detail?.channelType ?? "-"} />
                <KVRow label={t("rp.customer.language")} value={customer360?.customer.language ?? detail?.customerLanguage ?? "-"} />
                <KVRow label={t("rp.customer.firstContact")} value={customer360?.customer.firstContactAt ? new Date(customer360.customer.firstContactAt).toLocaleDateString() : "-"} />
              </Card>
              {(customer360?.customer.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {customer360!.customer.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {c360Tab === "history" && (
            <div className="flex flex-col gap-2">
              {(customer360?.history ?? []).length === 0 && <p className="text-xs text-slate-400">{t("rp.customer.noHistory")}</p>}
              {(customer360?.history ?? []).slice(0, 8).map((item) => (
                <button
                  key={item.caseId}
                  type="button"
                  onClick={() => onSelectConversation(item.conversationId)}
                  className="text-left rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="text-[10px] text-slate-400 mb-1">{new Date(item.occurredAt).toLocaleString()}</div>
                  <div className="text-xs text-slate-700 font-medium mb-1.5">
                    {item.caseTitle || t("rp.customer.unnamed")}
                    {item.summary ? ` · ${item.summary}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{item.caseId.slice(0, 8)}</Badge>
                    <Badge variant="outline">{item.channelType}</Badge>
                    {item.caseType && <Badge variant="outline">{item.caseType}</Badge>}
                    <Badge variant="default">{item.status}</Badge>
                    {item.sentiment && <Badge variant="outline">{item.sentiment}</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {c360Tab === "orders" && (
            <div>
              <SectionTitle>{t("rp.customer.orderClues")}</SectionTitle>
              {(customer360?.orderClues ?? []).length === 0 && <p className="text-xs text-slate-400">{t("rp.customer.noOrderClues")}</p>}
              <div className="flex flex-wrap gap-1.5">
                {(customer360?.orderClues ?? []).map((id) => (
                  <Badge key={id} variant="outline">{id}</Badge>
                ))}
              </div>
            </div>
          )}

          {c360Tab === "analysis" && (
            <div>
              <Card className="mb-3">
                <div className="text-[11px] font-semibold text-slate-700 mb-2">{t("rp.customer.analysisSummary")}</div>
                <div className="text-xs text-slate-600 leading-relaxed space-y-1">
                  {customerAnalysisLines.length === 0
                    ? t("rp.customer.noAnalysis")
                    : customerAnalysisLines.map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge variant="info">{t("rp.customer.currentIntent", { value: intentLabel(customer360?.aiAnalysis.intent ?? "general_inquiry") })}</Badge>
                  <Badge variant="default">{t("rp.customer.currentSentiment", { value: sentimentLabel(customer360?.aiAnalysis.sentiment ?? "neutral") })}</Badge>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {customer360?.customer.profileSummary && (
                  <Card>
                    <div className="text-[10px] font-semibold text-slate-500 mb-1">{t("rp.customer.profileSummary")}</div>
                    <div className="text-[11px] text-slate-600">{compactReadableText(customer360.customer.profileSummary, t("rp.customer.noContent"))}</div>
                  </Card>
                )}
                {customer360?.latestConversationIntelligence && (
                  <Card>
                    <div className="text-[10px] font-semibold text-slate-500 mb-1">{t("rp.customer.currentConversation")}</div>
                    <div className="text-[11px] text-slate-600">{compactReadableText(customer360.latestConversationIntelligence.summary, t("rp.customer.noContent"))}</div>
                  </Card>
                )}
                {topMemoryItems.length > 0 && (
                  <Card>
                    <div className="text-[10px] font-semibold text-slate-500 mb-1">{t("rp.customer.keyMemory")}</div>
                    <div className="text-[11px] text-slate-600">{topMemoryItems.map((item) => item.title ?? memoryTypeLabel(item.memoryType)).join(" · ")}</div>
                  </Card>
                )}
                {topStateSnapshots.length > 0 && (
                  <Card>
                    <div className="text-[10px] font-semibold text-slate-500 mb-1">{t("rp.customer.currentState")}</div>
                    <div className="text-[11px] text-slate-600">{topStateSnapshots.map((item) => titleCaseLabel(item.stateType)).join(" · ")}</div>
                  </Card>
                )}
              </div>

              {(customer360?.aiAnalysis.suggestions ?? []).length > 0 && (
                <>
                  <SectionTitle>{t("rp.customer.agentSuggestion")}</SectionTitle>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {customer360!.aiAnalysis.suggestions.map((item, index) => (
                      <div key={`${item}-${index}`} className="text-xs text-slate-700 pl-3 border-l-2 border-blue-300">{cleanupReadableText(item)}</div>
                    ))}
                  </div>
                </>
              )}

              {(customer360?.memoryItems ?? []).length > 0 && (
                <>
                  <SectionTitle>{t("rp.customer.longTermMemory")}</SectionTitle>
                  <div className="flex flex-col gap-2 mb-3">
                    {topMemoryItems.map((item, index) => (
                      <Card key={`${item.memoryType}-${index}`}>
                        <div className="text-[11px] font-medium text-slate-700 mb-1">{item.title ?? memoryTypeLabel(item.memoryType)}</div>
                        <div className="text-[11px] text-slate-500 mb-1.5">{cleanupReadableText(item.summary)}</div>
                        <div className="flex gap-1">
                          <Badge variant="outline">{memoryTypeLabel(item.memoryType)}</Badge>
                          <Badge variant="outline">salience {item.salience}</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}

              {(customer360?.stateSnapshots ?? []).length > 0 && (
                <>
                  <SectionTitle>{t("rp.customer.activeState")}</SectionTitle>
                  <div className="flex flex-col gap-2 mb-3">
                    {topStateSnapshots.map((item) => (
                      <Card key={item.stateType}>
                        <div className="text-[11px] font-medium text-slate-700 mb-1">{titleCaseLabel(item.stateType)}</div>
                        <div className="text-[11px] text-slate-500">{formatStatePayload(item.payload) || t("rp.customer.noStateDetail")}</div>
                      </Card>
                    ))}
                  </div>
                </>
              )}

              {sentimentBars.length > 0 && (
                <>
                  <SectionTitle>{t("rp.customer.sentimentTrend")}</SectionTitle>
                  <div className="flex flex-col gap-0.5 mb-3">
                    {sentimentBars.map((line, idx) => (
                      <span key={idx} className="text-[11px] text-slate-600 font-mono">{line}</span>
                    ))}
                  </div>
                </>
              )}

              {(customer360?.knowledgeRecommendations ?? []).length > 0 && (
                <>
                  <SectionTitle>{t("rp.customer.knowledgeRec")}</SectionTitle>
                  <div className="flex flex-col gap-2">
                    {topKnowledgeRecommendations.map((kb) => (
                      <Card key={kb.entryId}>
                        <div className="text-[11px] font-medium text-slate-700 mb-1.5">{kb.title}</div>
                        <div className="flex gap-1">
                          <Badge variant="outline">{kb.category}</Badge>
                          <Badge variant="outline">hit {kb.hitCount}</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── AI Copilot ── */}
        <TabsContent value="copilot" className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-0">

            {/* Summary */}
            <SectionTitle>{t("rp.copilot.summary")}</SectionTitle>
            <Card className="mb-3">
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                {copilot?.summary ?? t("rp.copilot.noSummary")}
              </p>
            </Card>

            {/* Intent + Sentiment */}
            <SectionTitle>{t("rp.copilot.intentSentiment")}</SectionTitle>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <Badge variant="info">{intentLabel(copilot?.intent ?? "general_inquiry")}</Badge>
              <Badge variant="default">{sentimentLabel(copilot?.sentiment ?? "neutral")}</Badge>
            </div>

            {/* AI Trace */}
            <SectionTitle>{t("rp.copilot.aiTrace")}</SectionTitle>
            {aiTraces.length === 0 && (
              <p className="text-xs text-slate-400 mb-2">{t("rp.copilot.noTrace")}</p>
            )}
            <div className="flex flex-col gap-2">
              {aiTraces.slice(0, 5).map((trace) => (
                <div
                  key={trace.traceId}
                  className="rounded-xl border border-slate-100 bg-white p-3 overflow-hidden"
                  style={{ borderLeft: `3px solid ${trace.error ? "#ef4444" : trace.handoffReason ? "#f59e0b" : "#6366f1"}` }}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400">
                      {new Date(trace.createdAt).toLocaleTimeString()}
                    </span>
                    <Badge variant={trace.error ? "danger" : "outline"} className="text-[10px] font-mono">
                      {trace.totalDurationMs}ms · {trace.tokenUsage.total} tok
                    </Badge>
                  </div>

                  {/* Skills called */}
                  {trace.skillsCalled.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {trace.skillsCalled.map((s) => (
                        <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-700 font-medium">
                          🔧 {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Handoff reason */}
                  {trace.handoffReason && (
                    <p className="text-[11px] text-amber-700 mb-1 leading-snug">
                      ↪ <b>{t("rp.copilot.handoffLabel")}</b> {trace.handoffReason}
                    </p>
                  )}

                  {/* Error */}
                  {trace.error && (
                    <p className="text-[11px] text-red-600 mb-1 leading-snug">
                      ⚠ <b>{t("rp.copilot.errorLabel")}</b> {trace.error}
                    </p>
                  )}

                  {/* Steps (collapsible) */}
                  {trace.steps.length > 0 && (
                    <details className="mt-1.5 group">
                      <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600 select-none list-none flex items-center gap-1">
                        <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                        {t("rp.copilot.steps", { count: trace.steps.length })}
                      </summary>
                      <ol className="mt-1.5 flex flex-col gap-1 pl-3 border-l border-slate-100">
                        {trace.steps.map((step, i) => (
                          <li key={i} className="text-[10px] text-slate-500 leading-snug">
                            <span className="font-semibold text-slate-600">{step.step}</span>
                            {(step.toolName || step.output !== undefined) && (
                              <span className="ml-1 opacity-70">
                                {JSON.stringify(step.output ?? step.toolName ?? "").slice(0, 100)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              ))}
            </div>

          </div>
        </TabsContent>

        {/* ── Skills ── */}
        <TabsContent value="skills" className="flex-1 overflow-y-auto p-3">
          <SectionTitle>{t("rp.skills.recommended")}</SectionTitle>
          {(skillRecommendation?.recommendations ?? []).length === 0 && (
            <p className="text-xs text-slate-400 mb-3">{t("rp.skills.noRecommendation")}</p>
          )}
          <div className="flex flex-col gap-2 mb-3">
            {(skillRecommendation?.recommendations ?? []).map((item) => (
              <Card key={item.skillName}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-800">{item.skillName}</span>
                  <span className="text-[10px] text-slate-400">score {item.score}</span>
                </div>
                <div className="text-[11px] text-slate-500 mb-2">{item.reasons.join(", ") || "context_match"}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => onSetPreferredSkills([item.skillName])}>
                    {t("rp.skills.useOnly")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onSetPreferredSkills([...(skillRecommendation?.preferredSkillNames ?? []), item.skillName])}>
                    {t("rp.skills.addPref")}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={skillExecuting === item.skillName}
                    onClick={() => void onExecuteSkill(item.skillName, {})}
                  >
                    {skillExecuting === item.skillName ? t("rp.skills.executing") : t("rp.skills.execute")}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            <Button variant="outline" size="sm" onClick={onApplyTopRecommendedSkills}>{t("rp.skills.applyTop3")}</Button>
            <Button variant="outline" size="sm" onClick={() => onSetPreferredSkills([])}>{t("rp.skills.clearPrefs")}</Button>
          </div>

          {lastSkillResult && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 mb-3">
              <span className="text-emerald-600">✅</span>
              <span className="text-xs text-emerald-700"><b>{lastSkillResult.skillName}</b> {t("rp.skills.skillDone")}</span>
            </div>
          )}

          <SectionTitle>{t("rp.skills.installed")}</SectionTitle>
          <div className="flex flex-col gap-2">
            {skillSchemas.length > 0 ? (
              skillSchemas.map((schema) => {
                const hasProps = Object.keys(schema.parameters?.properties ?? {}).length > 0;
                const isExpanded = paramSkillName === schema.name;
                const isExecuting = skillExecuting === schema.name;
                return (
                  <Card key={schema.name}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-slate-800 truncate">{schema.name}</span>
                        {hasProps && <Badge variant="warning">{t("rp.skills.needsParams")}</Badge>}
                      </div>
                      <Button
                        variant={isExpanded ? "ghost" : "primary"}
                        size="sm"
                        disabled={isExecuting && !isExpanded}
                        onClick={() => {
                          if (!hasProps) { void onExecuteSkill(schema.name, {}); return; }
                          setParamSkillName(isExpanded ? null : schema.name);
                        }}
                      >
                        {isExpanded ? t("rp.skills.collapse") : isExecuting ? t("rp.skills.executing") : t("rp.skills.execute")}
                      </Button>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">{schema.description.slice(0, 60)}{schema.description.length > 60 ? "…" : ""}</div>
                    {isExpanded && (
                      <SkillParamForm
                        schema={schema}
                        executing={isExecuting}
                        onExecute={(params) => { setParamSkillName(null); void onExecuteSkill(schema.name, params); }}
                        onCancel={() => setParamSkillName(null)}
                      />
                    )}
                  </Card>
                );
              })
            ) : (
              (skillRecommendation?.availableSkillNames ?? AVAILABLE_SKILLS.map((s) => s.code)).map((skillName) => (
                <Card key={skillName}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">{skillName}</span>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={skillExecuting === skillName}
                      onClick={() => void onExecuteSkill(skillName, {})}
                    >
                      {skillExecuting === skillName ? t("rp.skills.executing") : t("rp.skills.execute")}
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TaskOrdersTab
          currentAgentId={currentAgentId}
          tickets={tickets}
          ticketDetailsById={ticketDetailsById}
          ticketLoading={ticketLoading}
          taskDraft={taskDraft}
          colleagues={colleagues}
          copilot={copilot}
          onCreateTicket={onCreateTicket}
          onPatchTicket={onPatchTicket}
          onAddTicketComment={onAddTicketComment}
          onConsumeTaskDraft={onConsumeTaskDraft}
        />
      </Tabs>
    </aside>
  );
}
