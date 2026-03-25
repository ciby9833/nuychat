import { useRef, useState } from "react";

import { AVAILABLE_SKILLS } from "../constants";
import type {
  AiTrace,
  ConversationDetail,
  ConversationSkillRecommendationResponse,
  CopilotData,
  Customer360Data,
  RightTab,
  SkillExecuteResult,
  SkillSchema,
  Ticket
} from "../types";
import { intentLabel, sentimentLabel, shortTime } from "../utils";

function taskStatusLabel(status: Ticket["status"]): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "published":
      return "done";
    case "failed":
      return "failed";
    default:
      return status;
  }
}

// ─── Icon tab definitions ─────────────────────────────────────────────────────

const TABS: Array<{ key: RightTab; icon: string; label: string }> = [
  { key: "case",     icon: "🧩", label: "事项" },
  { key: "customer", icon: "👤", label: "客户" },
  { key: "copilot",  icon: "🤖", label: "AI" },
  { key: "skills",   icon: "⚡", label: "技能" },
  { key: "orders",   icon: "📋", label: "任务" }
];

// ─── Props ────────────────────────────────────────────────────────────────────

type RightPanelProps = {
  rightTab: RightTab;
  detail: ConversationDetail | null;
  copilot: CopilotData | null;
  aiTraces: AiTrace[];
  skillRecommendation: ConversationSkillRecommendationResponse | null;
  skillSchemas: SkillSchema[];
  tickets: Ticket[];
  ticketLoading: boolean;
  skillExecuting: string | null;
  lastSkillResult: SkillExecuteResult | null;
  customer360: Customer360Data | null;
  onTabChange: (tab: RightTab) => void;
  onSelectConversation: (id: string) => void;
  onApplyTopRecommendedSkills: () => void;
  onSetPreferredSkills: (skills: string[]) => void;
  onCreateTicket: (input: { title: string; description?: string; priority?: string }) => Promise<void>;
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
    <div className="param-form">
      {Object.entries(props).map(([key, def]) => {
        const isRequired = required.includes(key);
        const hasError = errors.includes(key);
        const cur = values[key];

        return (
          <div key={key}>
            <label className="param-label">
              {key}{isRequired ? <span className="req"> *</span> : ""}
              {def.description ? <span className="desc">{def.description.slice(0, 40)}</span> : null}
            </label>

            {def.enum ? (
              <select
                className={`param-select${hasError ? " error" : ""}`}
                value={cur as string ?? ""}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: e.target.value })); setErrors((p) => p.filter((x) => x !== key)); }}
              >
                {def.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : def.type === "boolean" ? (
              <select
                className={`param-select${hasError ? " error" : ""}`}
                value={cur === undefined ? "" : String(cur)}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: e.target.value === "true" })); setErrors((p) => p.filter((x) => x !== key)); }}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (def.type === "number" || def.type === "integer") ? (
              <input
                type="number"
                className={`param-input${hasError ? " error" : ""}`}
                value={cur as number ?? ""}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: Number(e.target.value) })); setErrors((p) => p.filter((x) => x !== key)); }}
                placeholder={def.description ?? key}
              />
            ) : (
              <input
                type="text"
                className={`param-input${hasError ? " error" : ""}`}
                value={cur as string ?? ""}
                onChange={(e) => { setValues((p) => ({ ...p, [key]: e.target.value })); setErrors((p) => p.filter((x) => x !== key)); }}
                placeholder={def.description ?? key}
              />
            )}

            {hasError && <div className="param-error-msg">必填项</div>}
          </div>
        );
      })}
      <div className="param-form-actions">
        <button className="param-confirm-btn" disabled={executing} onClick={handleExecute}>
          {executing ? "执行中…" : "确认执行"}
        </button>
        <button className="param-cancel-btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RightPanel(props: RightPanelProps) {
  const {
    rightTab,
    detail,
    copilot,
    aiTraces,
    skillRecommendation,
    skillSchemas,
    tickets,
    ticketLoading,
    skillExecuting,
    lastSkillResult,
    customer360,
    onTabChange,
    onSelectConversation,
    onApplyTopRecommendedSkills,
    onSetPreferredSkills,
    onCreateTicket,
    onExecuteSkill
  } = props;

  // ── Local state ──────────────────────────────────────────────────────────────
  const [c360Tab, setC360Tab] = useState<"base" | "history" | "orders" | "analysis">("base");
  const [paramSkillName, setParamSkillName] = useState<string | null>(null);

  // Ticket form state
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketFormLoading, setTicketFormLoading] = useState(false);

  const handleCreateTicket = async () => {
    if (!ticketTitle.trim()) return;
    setTicketFormLoading(true);
    try {
      await onCreateTicket({ title: ticketTitle.trim(), description: ticketDesc.trim() || undefined, priority: "normal" });
      setTicketTitle(""); setTicketDesc(""); setShowTicketForm(false);
    } finally {
      setTicketFormLoading(false);
    }
  };

  const sentimentBars = (customer360?.sentimentTrend ?? []).map((item) => {
    const s = item.sentiment.toLowerCase();
    const score = s === "positive" ? 5 : s === "neutral" ? 3 : s === "negative" ? 2 : 1;
    return `${new Date(item.occurredAt).toLocaleDateString()} ${"★".repeat(score)}${"☆".repeat(5 - score)}`;
  });

  return (
    <aside className="right-panel">
      {/* Icon tab bar */}
      <div className="rp-tab-bar">
        {TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            className={`rp-tab-btn${rightTab === key ? " active" : ""}`}
            onClick={() => onTabChange(key)}
          >
            <span className="rp-tab-icon">{icon}</span>
            <span>{label}</span>
            {key === "orders" && tickets.length > 0 && (
              <span className="rp-tab-badge">{tickets.length > 9 ? "9+" : tickets.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rp-tab-body">

        {rightTab === "case" && (
          <div>
            {!detail?.caseId ? (
              <p className="rp-empty">当前线程暂无事项</p>
            ) : (
              <>
                <ul className="rp-kv-list">
                  <li><span>事项ID</span><b><code>{detail.caseId.slice(0, 8)}</code></b></li>
                  <li><span>状态</span><b>{detail.caseStatus ?? "-"}</b></li>
                  <li><span>类型</span><b>{detail.caseType ?? "-"}</b></li>
                  <li><span>标题</span><b>{detail.caseTitle ?? "-"}</b></li>
                  <li><span>打开时间</span><b>{detail.caseOpenedAt ? shortTime(detail.caseOpenedAt) : "-"}</b></li>
                  <li><span>最近活动</span><b>{detail.caseLastActivityAt ? shortTime(detail.caseLastActivityAt) : "-"}</b></li>
                </ul>
                <div>
                  <div className="rp-section-title">事项摘要</div>
                  <div className="rp-block">{detail.caseSummary || "暂无事项摘要"}</div>
                </div>
                <div>
                  <div className="rp-section-title">事项任务</div>
                  {tickets.length === 0 ? (
                    <p className="rp-empty">当前事项暂无任务</p>
                  ) : (
                    <div className="rp-chips">
                      {tickets.map((ticket) => (
                        <span key={ticket.ticketId} className="rp-chip">
                          {ticket.title} · {taskStatusLabel(ticket.status)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Customer 360 ── */}
        {rightTab === "customer" && (
          <div>
            <div className="c360-tabs">
              {(["base", "history", "orders", "analysis"] as const).map((t) => (
                <button key={t} className={`c360-tab${c360Tab === t ? " active" : ""}`} onClick={() => setC360Tab(t)}>
                  {t === "base" ? "基础" : t === "history" ? "历史" : t === "orders" ? "订单" : "AI分析"}
                </button>
              ))}
            </div>

            {c360Tab === "base" && (
              <div>
                <ul className="rp-kv-list">
                  <li><span>姓名</span><b>{customer360?.customer.name ?? detail?.customerName ?? "-"}</b></li>
                  <li><span>客户ID</span><b>{customer360?.customer.reference ?? detail?.customerRef ?? "-"}</b></li>
                  <li><span>等级</span><b>{(customer360?.customer.tier ?? detail?.customerTier ?? "standard").toUpperCase()}</b></li>
                  <li><span>渠道</span><b>{customer360?.customer.channelType ?? detail?.channelType ?? "-"}</b></li>
                  <li><span>语言</span><b>{customer360?.customer.language ?? detail?.customerLanguage ?? "-"}</b></li>
                  <li><span>首联</span><b>{customer360?.customer.firstContactAt ? new Date(customer360.customer.firstContactAt).toLocaleDateString() : "-"}</b></li>
                </ul>
                {(customer360?.customer.tags ?? []).length > 0 && (
                  <div className="rp-chips">
                    {customer360!.customer.tags.map((tag) => (
                      <span key={tag} className="rp-chip">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {c360Tab === "history" && (
              <div>
                {(customer360?.history ?? []).length === 0 && <p className="rp-empty">暂无历史事项</p>}
                {(customer360?.history ?? []).slice(0, 8).map((item) => (
                  <div
                    key={item.caseId}
                    className="history-card"
                    onClick={() => onSelectConversation(item.conversationId)}
                  >
                    <div className="history-time">{new Date(item.occurredAt).toLocaleString()}</div>
                    <div className="history-summary">
                      {item.caseTitle || "未命名事项"}
                      {item.summary ? ` · ${item.summary}` : ""}
                    </div>
                    <div className="history-tags">
                      <span className="history-tag">事项 {item.caseId.slice(0, 8)}</span>
                      <span className="history-tag">{item.channelType}</span>
                      {item.caseType && <span className="history-tag">{item.caseType}</span>}
                      <span className="history-tag">{item.status}</span>
                      {item.sentiment && <span className="history-tag">{item.sentiment}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {c360Tab === "orders" && (
              <div>
                <p className="rp-section-title">订单线索</p>
                {(customer360?.orderClues ?? []).length === 0 && <p className="rp-empty">暂无订单线索</p>}
                <div className="rp-chips">
                  {(customer360?.orderClues ?? []).map((id) => (
                    <span key={id} className="rp-chip">{id}</span>
                  ))}
                </div>

              </div>
            )}

            {c360Tab === "analysis" && (
              <div>
                <p className="rp-section-title">AI分析</p>
                <div className="rp-block">{customer360?.aiAnalysis.summary ?? copilot?.summary ?? "暂无分析"}</div>
                <div className="rp-chips" style={{ marginBottom: 8 }}>
                  <span className="rp-chip">意图: {intentLabel(customer360?.aiAnalysis.intent ?? copilot?.intent ?? "general_inquiry")}</span>
                  <span className="rp-chip">情绪: {sentimentLabel(customer360?.aiAnalysis.sentiment ?? copilot?.sentiment ?? "neutral")}</span>
                </div>

                {sentimentBars.length > 0 && (
                  <>
                    <p className="rp-section-title">情绪趋势</p>
                    {sentimentBars.map((line, idx) => (
                      <span key={idx} className="sentiment-line">{line}</span>
                    ))}
                  </>
                )}

                {(customer360?.knowledgeRecommendations ?? []).length > 0 && (
                  <>
                    <p className="rp-section-title">知识推荐</p>
                    {(customer360!.knowledgeRecommendations).slice(0, 5).map((kb) => (
                      <div key={kb.entryId} className="history-card">
                        <div className="history-time">{kb.title}</div>
                        <div className="history-tags">
                          <span className="history-tag">{kb.category}</span>
                          <span className="history-tag">hit {kb.hitCount}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── AI Copilot ── */}
        {rightTab === "copilot" && (
          <div>
            <p className="rp-section-title">会话摘要</p>
            <div className="rp-block">{copilot?.summary ?? "暂无摘要"}</div>

            <p className="rp-section-title">意图 · 情绪</p>
            <div className="rp-chips">
              <span className="rp-chip">{intentLabel(copilot?.intent ?? "general_inquiry")}</span>
              <span className="rp-chip">{sentimentLabel(copilot?.sentiment ?? "neutral")}</span>
            </div>

            <p className="rp-section-title">AI 推理轨迹</p>
            {aiTraces.length === 0 && <p className="rp-empty">本会话未触发 AI 编排</p>}
            {aiTraces.slice(0, 5).map((trace) => (
              <div
                key={trace.traceId}
                className="trace-card"
                style={{ borderLeft: `3px solid ${trace.error ? "#ef4444" : trace.handoffReason ? "#f59e0b" : "#6366f1"}` }}
              >
                <div className="trace-meta">
                  <span className="trace-time">{new Date(trace.createdAt).toLocaleTimeString()}</span>
                  <span className="trace-badge">{trace.totalDurationMs}ms · {trace.tokenUsage.total} tokens</span>
                </div>
                {trace.skillsCalled.length > 0 && (
                  <p className="trace-skill">🔧 <b>技能:</b> {trace.skillsCalled.join(", ")}</p>
                )}
                {trace.handoffReason && (
                  <p className="trace-handoff">↪ <b>转人工:</b> {trace.handoffReason}</p>
                )}
                {trace.error && (
                  <p className="trace-error">⚠ <b>错误:</b> {trace.error}</p>
                )}
                <details className="trace-steps">
                  <summary>步骤详情 ({trace.steps.length})</summary>
                  <ul>
                    {trace.steps.map((step, i) => (
                      <li key={i}><b>{step.step}</b>: {JSON.stringify(step.output ?? step.toolName ?? "—").slice(0, 80)}</li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        )}

        {/* ── Skills ── */}
        {rightTab === "skills" && (
          <div>
            <p className="rp-section-title">AI 推荐技能</p>
            <div className="skills-list">
              {(skillRecommendation?.recommendations ?? []).map((item) => (
                <div key={item.skillName} className="skill-card">
                  <div className="skill-card-head">
                    <span className="skill-name">{item.skillName}</span>
                    <span style={{ fontSize: 10, color: "#8c8c8c" }}>score {item.score}</span>
                  </div>
                  <div className="skill-desc">{item.reasons.join(", ") || "context_match"}</div>
                  <div className="skill-actions">
                    <button type="button" className="skill-exec-btn secondary" onClick={() => onSetPreferredSkills([item.skillName])}>
                      仅用
                    </button>
                    <button type="button" className="skill-exec-btn secondary" onClick={() => onSetPreferredSkills([...(skillRecommendation?.preferredSkillNames ?? []), item.skillName])}>
                      加偏好
                    </button>
                    <button
                      type="button"
                      className="skill-exec-btn"
                      disabled={skillExecuting === item.skillName}
                      onClick={() => void onExecuteSkill(item.skillName, {})}
                    >
                      {skillExecuting === item.skillName ? "执行中…" : "执行"}
                    </button>
                  </div>
                </div>
              ))}
              {(skillRecommendation?.recommendations ?? []).length === 0 && <p className="rp-empty">暂无推荐技能</p>}
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              <button type="button" className="rp-outline-btn" onClick={onApplyTopRecommendedSkills}>应用 Top3</button>
              <button type="button" className="rp-outline-btn" onClick={() => onSetPreferredSkills([])}>清空偏好</button>
            </div>

            {lastSkillResult && (
              <div className="skill-result-ok">
                ✅ <b>{lastSkillResult.skillName}</b> 执行完成
              </div>
            )}

            <p className="rp-section-title">可调用技能（已安装）</p>
            <div className="skills-list">
              {skillSchemas.length > 0 ? (
                skillSchemas.map((schema) => {
                  const hasProps = Object.keys(schema.parameters?.properties ?? {}).length > 0;
                  const isExpanded = paramSkillName === schema.name;
                  const isExecuting = skillExecuting === schema.name;

                  return (
                    <div key={schema.name} className="skill-card">
                      <div className="skill-card-head">
                        <div>
                          <span className="skill-name">{schema.name}</span>
                          {hasProps && <span className="skill-needs-param">需填参数</span>}
                        </div>
                        <button
                          type="button"
                          className={`skill-exec-btn${isExpanded ? " secondary" : ""}`}
                          disabled={isExecuting && !isExpanded}
                          onClick={() => {
                            if (!hasProps) { void onExecuteSkill(schema.name, {}); return; }
                            setParamSkillName(isExpanded ? null : schema.name);
                          }}
                        >
                          {isExpanded ? "收起" : isExecuting ? "执行中…" : "执行"}
                        </button>
                      </div>
                      <div className="skill-desc">{schema.description.slice(0, 60)}{schema.description.length > 60 ? "…" : ""}</div>

                      {isExpanded && (
                        <SkillParamForm
                          schema={schema}
                          executing={isExecuting}
                          onExecute={(params) => {
                            setParamSkillName(null);
                            void onExecuteSkill(schema.name, params);
                          }}
                          onCancel={() => setParamSkillName(null)}
                        />
                      )}
                    </div>
                  );
                })
              ) : (
                (skillRecommendation?.availableSkillNames ?? AVAILABLE_SKILLS.map((s) => s.code)).map((skillName) => (
                  <div key={skillName} className="skill-card">
                    <div className="skill-card-head">
                      <span className="skill-name">{skillName}</span>
                      <button
                        type="button"
                        className="skill-exec-btn"
                        disabled={skillExecuting === skillName}
                        onClick={() => void onExecuteSkill(skillName, {})}
                      >
                        {skillExecuting === skillName ? "执行中…" : "执行"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Orders / Tasks ── */}
        {rightTab === "orders" && (
          <div>
            <div className="section-action-row">
              <p className="rp-section-title" style={{ margin: 0 }}>任务列表</p>
              <button
                type="button"
                className={`rp-outline-btn${showTicketForm ? " active" : ""}`}
                onClick={() => setShowTicketForm((v) => !v)}
              >
                {showTicketForm ? "取消" : "+ 创建任务"}
              </button>
            </div>

            {showTicketForm && (
              <div className="ticket-form">
                <input
                  type="text"
                  placeholder="任务标题 *"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                />
                <textarea
                  placeholder="描述（可选）"
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                />
                <div className="ticket-form-footer">
                  <button
                    className="ticket-submit-btn"
                    disabled={ticketFormLoading || !ticketTitle.trim()}
                    onClick={() => void handleCreateTicket()}
                  >
                    {ticketFormLoading ? "创建中…" : "确认创建"}
                  </button>
                </div>
              </div>
            )}

            {(copilot?.entities.orderIds ?? []).length > 0 && (
              <>
                <p className="rp-section-title">订单标记</p>
                <div className="rp-chips">
                  {(copilot?.entities.orderIds ?? []).map((id) => (
                    <span key={id} className="rp-chip">{id}</span>
                  ))}
                </div>
              </>
            )}

            {ticketLoading && <p className="rp-empty">加载任务中…</p>}
            {!ticketLoading && tickets.length === 0 && <p className="rp-empty">暂无任务</p>}

            {tickets.map((t) => (
              <div key={t.ticketId} className="ticket-card">
                <div className="ticket-head">
                  <div className="ticket-info">
                    <p className="ticket-title">{t.title}</p>
                    <p className="ticket-meta">{taskStatusLabel(t.status)} · {t.createdByType}</p>
                  </div>
                </div>
                {t.description && <p className="ticket-desc">{t.description}</p>}
                <p className="ticket-created-at">创建于 {shortTime(t.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
