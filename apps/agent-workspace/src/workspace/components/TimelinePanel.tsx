import { useEffect, useMemo, useRef, useState } from "react";
import { QUICK_PHRASES } from "../constants";
import type { AgentColleague, ConversationDetail, MessageItem, Ticket } from "../types";
import { fullTimestamp, messageDateSeparator } from "../utils";

type TimelinePanelProps = {
  detail: ConversationDetail | null;
  messages: MessageItem[];
  reply: string;
  pendingMedia: { url: string; mimeType: string; fileName: string } | null;
  viewHint: string;
  aiSuggestions: string[];
  recommendedSkills: string[];
  isAssignedToMe: boolean;
  actionLoading: string | null;
  tickets: Ticket[];
  colleagues: AgentColleague[];
  onReplyChange: (v: string) => void;
  onSendReply: () => Promise<void>;
  onUploadFile: (file: File) => Promise<void>;
  onClearMedia: () => void;
  onAssign: () => Promise<void>;
  onHandoff: () => Promise<void>;
  onTransfer: (targetAgentId: string, reason?: string) => Promise<void>;
  onResolve: (closeLinkedTickets?: boolean) => Promise<void>;
};

/** Render item: either a date separator or a message */
type RenderItem =
  | { kind: "sep"; label: string; id: string }
  | { kind: "msg"; msg: MessageItem; showTime: boolean };

// ── Multimedia bubble content renderer ─────────────────────────────────────────

function fileIcon(fileName: string | undefined): string {
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["xlsx", "xls", "csv"].includes(ext)) return "📊";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "📦";
  return "📎";
}

function renderBubbleContent(m: MessageItem): React.ReactNode {
  const c = m.content;
  const mt = m.message_type;

  // ── Image ────────────────────────────────────────────────────
  if (mt === "media" && c.media?.mimeType?.startsWith("image/")) {
    return (
      <div className="media-bubble">
        <img
          src={c.media.url}
          alt={c.media.fileName ?? "image"}
          className="bubble-img"
          loading="lazy"
          onClick={() => c.media?.url && window.open(c.media.url, "_blank")}
        />
        {c.text && <div className="media-caption">{c.text}</div>}
      </div>
    );
  }

  // ── Video ────────────────────────────────────────────────────
  if (mt === "media" && c.media?.mimeType?.startsWith("video/")) {
    return (
      <div className="media-bubble">
        <video src={c.media.url} controls className="bubble-video" preload="metadata" />
        {c.text && <div className="media-caption">{c.text}</div>}
      </div>
    );
  }

  // ── Audio ────────────────────────────────────────────────────
  if (mt === "media" && c.media?.mimeType?.startsWith("audio/")) {
    return (
      <div className="media-bubble">
        <audio src={c.media.url} controls className="bubble-audio" preload="metadata" />
      </div>
    );
  }

  // ── Document / File ──────────────────────────────────────────
  if (mt === "media" && c.media) {
    const icon = fileIcon(c.media.fileName);
    return (
      <div className="file-bubble">
        <span className="file-icon">{icon}</span>
        <div className="file-info">
          <span className="file-name">{c.media.fileName ?? "附件"}</span>
          <span className="file-type">{c.media.mimeType ?? ""}</span>
        </div>
        {c.media.url && (
          <a href={c.media.url} target="_blank" rel="noreferrer" className="file-download">下载</a>
        )}
      </div>
    );
  }

  // ── Location ─────────────────────────────────────────────────
  if (mt === "location" && c.location) {
    return (
      <div className="location-bubble">
        <span className="location-pin">📍</span>
        <div>
          {c.location.name && <div className="location-name">{c.location.name}</div>}
          {c.location.address && <div className="location-addr">{c.location.address}</div>}
          <div className="location-coord">
            {c.location.latitude.toFixed(5)}, {c.location.longitude.toFixed(5)}
          </div>
        </div>
      </div>
    );
  }

  // ── Contacts ─────────────────────────────────────────────────
  if (mt === "contacts" && c.contacts?.length) {
    return (
      <div className="contacts-bubble">
        {c.contacts.map((ct, i) => (
          <div key={i} className="contact-row">
            <span className="contact-name">👤 {ct.name ?? "未知"}</span>
            {ct.phones?.map((p, j) => (
              <span key={j} className="contact-phone">{p}</span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── Reaction (emoji) ─────────────────────────────────────────
  if (mt === "reaction") {
    return <span className="reaction-bubble">{c.text ?? "😀"}</span>;
  }

  // ── Skill result / task update ───────────────────────────────
  if ((mt === "skill_result" || mt === "task_update") && c.skillName) {
    return (
      <div className="skill-result-bubble">
        <div className="skill-result-head">⚡ {c.skillName}</div>
        <pre className="skill-result-body">
          {JSON.stringify(c.result, null, 2)}
        </pre>
      </div>
    );
  }

  // ── Default: plain text ──────────────────────────────────────
  return c.text ?? "[非文本消息]";
}

export function TimelinePanel(props: TimelinePanelProps) {
  const {
    detail,
    messages,
    reply,
    pendingMedia,
    viewHint,
    aiSuggestions,
    recommendedSkills,
    isAssignedToMe,
    actionLoading,
    tickets,
    colleagues,
    onReplyChange,
    onSendReply,
    onUploadFile,
    onClearMedia,
    onAssign,
    onHandoff,
    onTransfer,
    onResolve
  } = props;

  const [resolveConfirm, setResolveConfirm] = useState(false);
  // Transfer dialog state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const openTickets = tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const isResolved = detail?.status === "resolved" || detail?.status === "closed";
  // Locked: another agent is actively handling this conversation right now.
  const isLockedByAnotherAgent = Boolean(detail && !isAssignedToMe && detail.status === "human_active");
  // Agent can send when:
  //   • they own the conversation (live), OR
  //   • the conversation is resolved (backend auto-reactivates on send)
  // Blocked only when another agent has it locked in human_active state.
  const canSend = Boolean(
    detail && !isLockedByAnotherAgent && (reply.trim() || pendingMedia) && (isAssignedToMe || isResolved)
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Auto-resize textarea
  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    const maxH = 220;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  };
  useEffect(() => { resizeTextarea(); }, [reply]);

  // Track if user has scrolled up
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 200;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Scroll to bottom when a new conversation is selected; also reset transfer state
  useEffect(() => {
    userScrolledUpRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
    setShowTransfer(false);
    setTransferTargetId("");
    setTransferReason("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.conversationId]);

  // Build render items: insert date separators + compute timestamp clustering
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const prev = i > 0 ? messages[i - 1] : null;

      // Date separator
      const sep = messageDateSeparator(prev, m);
      if (sep) {
        items.push({ kind: "sep", label: sep, id: `sep-${i}` });
      }

      items.push({ kind: "msg", msg: m, showTime: true });
    }
    return items;
  }, [messages]);

  const sendNow = () => {
    if (!canSend) return;
    // For resolved conversations the outbound worker transparently reactivates
    // the conversation and assigns it to this agent — no separate reopen step.
    void onSendReply();
  };

  const handleFileSelect = async (file: File) => {
    if (uploading) return;
    setUploading(true);
    try {
      await onUploadFile(file);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileSelect(file);
  };

  const handleResolveClick = () => {
    if (openTickets.length > 0) {
      setResolveConfirm(true);
    } else {
      void onResolve(false);
    }
  };

  const handleTransferConfirm = () => {
    if (!transferTargetId) return;
    setShowTransfer(false);
    void onTransfer(transferTargetId, transferReason || undefined);
    setTransferTargetId("");
    setTransferReason("");
  };

  const hintType = viewHint.startsWith("🔴") ? "error" : viewHint.startsWith("⚠️") ? "warning" : "info";

  // Sort colleagues: online first, then by name
  const sortedColleagues = useMemo(() => {
    return [...colleagues].sort((a, b) => {
      const aOnline = a.status === "online" || a.status === "busy" ? 0 : 1;
      const bOnline = b.status === "online" || b.status === "busy" ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });
  }, [colleagues]);

  return (
    <section className="timeline-panel">
      {/* Customer header + actions */}
      <div className="timeline-head">
        {detail ? (
          <>
            <div className="customer-info">
              <div className="customer-avatar">
                {(detail.customerName ?? detail.customerRef ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="customer-name">{detail.customerName ?? detail.customerRef}</div>
                <div className="customer-meta">
                  {detail.customerRef} · {detail.customerLanguage} · {detail.channelType} · {detail.operatingMode}
                </div>
              </div>
            </div>

            <div className="head-actions">
              {!isAssignedToMe && detail.status !== "resolved" && (
                <button onClick={() => void onAssign()} disabled={actionLoading !== null}>
                  {actionLoading === "assign" ? "处理中…" : "接管"}
                </button>
              )}
              {isAssignedToMe && detail.status !== "resolved" && (
                <>
                  <button onClick={() => void onHandoff()} disabled={actionLoading !== null}>
                    {actionLoading === "handoff" ? "处理中…" : "退回 AI"}
                  </button>
                  <button
                    className="transfer-btn"
                    onClick={() => setShowTransfer((v) => !v)}
                    disabled={actionLoading !== null}
                    title="转移给其他客服"
                  >
                    {actionLoading === "transfer" ? "转移中…" : "转移"}
                  </button>
                </>
              )}
              {detail.status !== "resolved" && (
                <button
                  className={resolveConfirm ? "" : "primary"}
                  onClick={handleResolveClick}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "resolve" ? "处理中…" : "解决"}
                </button>
              )}
              {isResolved && (
                <span className="resolved-badge" title="发送消息将自动重新激活此会话">
                  ✓ 已解决
                </span>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 13, color: "#8c8c8c" }}>请从左侧选择会话</span>
        )}
      </div>

      {/* Transfer dialog (inline dropdown) */}
      {showTransfer && (
        <div className="transfer-dialog">
          <div className="transfer-dialog-title">转移会话给：</div>
          <select
            className="transfer-select"
            value={transferTargetId}
            onChange={(e) => setTransferTargetId(e.target.value)}
          >
            <option value="">— 选择客服 —</option>
            {sortedColleagues.map((c) => {
              const isOnline = c.status === "online" || c.status === "busy";
              const label = `${c.displayName ?? "未知"}${c.employeeNo ? ` #${c.employeeNo}` : ""} ${isOnline ? "🟢" : "⚪"}`;
              return (
                <option key={c.agentId} value={c.agentId}>
                  {label}
                </option>
              );
            })}
          </select>
          <input
            className="transfer-reason"
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            placeholder="备注（可选）"
          />
          <div className="transfer-actions">
            <button
              className="primary"
              onClick={handleTransferConfirm}
              disabled={!transferTargetId}
            >
              确认转移
            </button>
            <button onClick={() => setShowTransfer(false)}>取消</button>
          </div>
        </div>
      )}

      {/* viewHint banner */}
      {viewHint && (
        <div className={`view-hint-banner ${hintType}`}>{viewHint}</div>
      )}

      {/* Locked banner when not assigned to current agent */}
      {isLockedByAnotherAgent && (
        <div className="view-hint-banner warning">
          🔒 该会话已分配给其他客服，您当前处于只读模式
        </div>
      )}

      {/* Resolve confirmation bar */}
      {resolveConfirm && (
        <div className="resolve-confirm-bar">
          <span className="rc-label">有 {openTickets.length} 个开放工单</span>
          <button onClick={() => { setResolveConfirm(false); void onResolve(false); }}>仅结束会话</button>
          <button className="danger" onClick={() => { setResolveConfirm(false); void onResolve(true); }}>
            结束 + 关闭工单
          </button>
          <button className="cancel" onClick={() => setResolveConfirm(false)}>取消</button>
        </div>
      )}

      {/* Message list */}
      <div className="message-timeline" ref={listRef}>
        {!detail && (
          <div className="tl-empty">
            <div className="tl-empty-icon">💬</div>
            <div>选择一个会话开始协作处理</div>
          </div>
        )}

        {detail && messages.length === 0 && (
          <div className="tl-empty">
            <div className="tl-empty-icon">📭</div>
            <div>暂无消息记录</div>
          </div>
        )}

        {renderItems.map((item) => {
          if (item.kind === "sep") {
            return (
              <div key={item.id} className="msg-date-sep">
                <span>{item.label}</span>
              </div>
            );
          }

          const m = item.msg;
          const isOut = m.direction === "outbound";
          const isSystem = m.sender_type === "system";
          const isAI = m.sender_type === "bot" && isOut;
          const isAgent = m.sender_type === "agent" && isOut;
          const rowClass = isSystem ? "system" : isOut ? "out" : "in";
          const bubbleClass = isSystem ? "system" : isAI ? "bot" : isOut ? "out" : "in";

          // AI attribution: show AI agent name with robot emoji
          const aiLabel = isAI
            ? `🤖 ${m.content?.aiAgentName ?? "AI 助手"}`
            : null;
          // Human agent attribution: name + employee_no
          const agentLabel = isAgent
            ? [m.sender_name, m.sender_employee_no ? `#${m.sender_employee_no}` : null]
                .filter(Boolean)
                .join(" ")
            : null;
          const attrLabel = aiLabel ?? agentLabel;

          return (
            <div key={m.message_id} className={`msg-row ${rowClass}`}>
              {/* Attribution label above outbound messages (human agent or AI) */}
              {attrLabel && (
                <div className={`msg-agent-attr${isAI ? " ai-attr" : ""}`}>{attrLabel}</div>
              )}
              <div className={`msg-bubble ${bubbleClass}`}>
                {renderBubbleContent(m)}
              </div>
              {/* Always show full timestamp for every message */}
              <div className="msg-time msg-time--full">{fullTimestamp(m.created_at)}</div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="composer">
        {/* Copilot suggestion bar — streaming Claude-style suggestions above composer */}
        <div className="copilot-bar">
          <div className="copilot-bar-header">
            <span className="copilot-icon">✦</span>
            <span className="copilot-bar-title">Copilot</span>
            {detail && aiSuggestions.length === 0 && recommendedSkills.length === 0 && (
              <span className="copilot-thinking">
                <span /><span /><span />
              </span>
            )}
            <div className="copilot-quick-tools">
              <button type="button" className="tool-btn" title="总结客户诉求" onClick={() => onReplyChange((reply.trim() ? reply + "\n" : "") + "请先总结客户诉求，再给出下一步建议。")}>摘要</button>
              <button type="button" className="tool-btn" title="润色当前草稿" onClick={() => onReplyChange((reply.trim() ? reply + "\n" : "") + "请将上文转换为更礼貌、简短的客服回复。")}>润色</button>
              <button type="button" className="tool-btn" title="翻译为客户语言" onClick={() => onReplyChange((reply.trim() ? reply + "\n" : "") + "请翻译为客户语言并保留业务术语。")}>翻译</button>
            </div>
          </div>

          {/* AI suggested replies — animated stream-in cards */}
          {aiSuggestions.length > 0 && (
            <div className="copilot-suggestions">
              {aiSuggestions.slice(0, 3).map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className="suggestion-card"
                  style={{ animationDelay: `${i * 80}ms` }}
                  onClick={() => onReplyChange(s)}
                  disabled={!isAssignedToMe}
                  title={s}
                >
                  <span className="suggestion-text">{s}</span>
                  <span className="suggestion-use">↩</span>
                </button>
              ))}
            </div>
          )}

          {/* Recommended skill + quick phrase chips */}
          <div className="copilot-chip-row">
            {recommendedSkills.slice(0, 3).map((skill, i) => (
              <button
                key={skill}
                type="button"
                className="skill-inline-chip"
                style={{ animationDelay: `${(Math.min(aiSuggestions.length, 3) + i) * 80}ms` }}
                onClick={() => onReplyChange(`请调用技能：${skill}`)}
                disabled={!isAssignedToMe}
              >
                ⚡ {skill}
              </button>
            ))}
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                className="quick-phrase-chip"
                onClick={() => onReplyChange(phrase)}
                disabled={!isAssignedToMe}
                title={phrase}
              >
                {phrase.slice(0, 12)}{phrase.length > 12 ? "…" : ""}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`composer-box${dragOver ? " drag-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Attachment preview bar */}
          {pendingMedia && (
            <div className="attachment-preview">
              {pendingMedia.mimeType.startsWith("image/")
                ? <img src={`http://localhost:3000${pendingMedia.url}`} alt={pendingMedia.fileName} className="attach-thumb" />
                : <span className="attach-file-icon">{fileIcon(pendingMedia.fileName)} {pendingMedia.fileName}</span>
              }
              <button type="button" onClick={onClearMedia} className="attach-remove" title="移除附件">✕</button>
            </div>
          )}
          {uploading && <div className="attachment-preview"><span className="attach-file-icon">上传中…</span></div>}
          <textarea
            ref={textareaRef}
            value={reply}
            onChange={(e) => { onReplyChange(e.target.value); resizeTextarea(); }}
            placeholder={
              isLockedByAnotherAgent
                ? "该会话已分配给其他客服，无法回复"
                : isResolved
                  ? "输入消息继续跟进此客户…"
                  : isAssignedToMe
                    ? "输入消息…"
                    : "请先接管会话后再回复"
            }
            disabled={isLockedByAnotherAgent}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendNow();
              }
            }}
          />
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.rar,.7z"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelect(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="composer-actions">
          <span className={`char-count${reply.length > 500 ? " warn" : ""}`}>{reply.length} · Enter 发送</span>
          <div className="right-actions">
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLockedByAnotherAgent || uploading}
              title="添加附件"
            >
              📎
            </button>
            <button type="button" className="subtle-btn" onClick={() => { onReplyChange(""); onClearMedia(); }} disabled={!reply && !pendingMedia}>
              清空
            </button>
            <button type="button" className="send-btn" onClick={sendNow} disabled={!canSend}>
              发送
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
