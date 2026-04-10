/**
 * 功能名称: WA 聊天主面板
 * 菜单路径: 工作台 / WA工作台 / 中间聊天区
 * 文件职责: 展示聊天头部、消息流（支持全类型）、未读分割线、引用回复与发送区。
 * 支持消息类型: text / image / video / audio / document / sticker / reaction / location /
 *              contact_card / 已撤回 / 未知类型降级兜底
 */

import { type ChangeEvent, type ClipboardEvent, useLayoutEffect, useRef, useState, useCallback } from "react";

import { API_BASE_URL } from "../../api";
import type { Session } from "../../types";
import type { WaAttachment, WaConversationDetail, WaMessageItem, WaReaction } from "../types";

// ─── Prop types ──────────────────────────────────────────────────────────────

type WaChatPanelProps = {
  session: Session;
  detail: WaConversationDetail | null;
  detailLoading: boolean;
  firstUnreadCount: number;
  hasMoreMessages: boolean;
  loadingMoreMessages: boolean;
  onLoadMoreMessages: () => void;
  composerText: string;
  onComposerTextChange: (value: string) => void;
  quotedMessage: WaMessageItem | null;
  onClearQuoted: () => void;
  uploadingAttachments: Array<{ localId: string; fileName: string; mimeType: string; url: string }>;
  onRemoveAttachment: (localId: string) => void;
  onUploadFiles: (files: FileList | null) => void;
  onTakeover: () => void;
  onRelease: () => void;
  onReplyToMessage: (message: WaMessageItem) => void;
  onSendReaction: (message: WaMessageItem, emoji: string) => void;
  onSend: () => void;
  actionLoading: string | null;
};

// ─── Utility helpers ─────────────────────────────────────────────────────────

/**
 * Resolves the display URL for a WhatsApp attachment.
 * WhatsApp CDN URLs (mmg.whatsapp.net/*.enc) are AES-CBC encrypted and cannot
 * be loaded directly in <img>/<video>/<audio>. Route them through our server-side
 * decrypt proxy which re-emits clear-text bytes.
 */
function mediaProxyUrl(att: WaAttachment, token: string): string | null {
  const raw = att.storageUrl || att.previewUrl;
  // Always route through the media proxy when we have an attachmentId.
  // The proxy handles both:
  //   • encrypted WhatsApp CDN URLs (mmg.whatsapp.net/*.enc) — decrypts via Baileys
  //   • plain public URLs (WhatsApp Channels/Newsletters staticUrl) — fetch-and-proxy
  // This also covers the case where storageUrl is null for newsletter images: the proxy
  // reads the stored provider_payload and extracts the staticUrl from there.
  if (att.attachmentId) {
    return `${API_BASE_URL}/api/wa/media/${att.attachmentId}?token=${encodeURIComponent(token)}`;
  }
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  return raw;
}

function fmtDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

/** Derives a simple icon character from a MIME type or filename extension. */
function docIcon(mimeType: string | null, fileName: string | null): string {
  const m = (mimeType ?? "").toLowerCase();
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();
  if (m.includes("pdf") || ext === "pdf") return "📄";
  if (m.includes("word") || ["doc", "docx"].includes(ext)) return "📝";
  if (m.includes("sheet") || m.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (m.includes("presentation") || m.includes("powerpoint") || ["ppt", "pptx"].includes(ext)) return "📑";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️";
  if (m.startsWith("video/") || ["mp4", "mov", "avi", "mkv"].includes(ext)) return "🎬";
  if (m.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "opus"].includes(ext)) return "🎵";
  if (m.includes("zip") || m.includes("archive") || ["zip", "rar", "7z", "tar"].includes(ext)) return "📦";
  return "📎";
}

// ─── Per-type message body renderers ─────────────────────────────────────────

/** Image message — shows inline preview with error fallback. */
function ImageBody({ att, caption, mine, token }: { att: WaAttachment; caption: string | null; mine: boolean; token: string }) {
  const [failed, setFailed] = useState(false);
  const url = mediaProxyUrl(att, token);

  return (
    <div className="max-w-[280px]">
      {url && !failed ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={caption || "图片"}
            className="block max-h-[300px] w-full rounded-[8px] object-cover"
            onError={() => setFailed(true)}
          />
        </a>
      ) : (
        <div
          className={`flex h-[160px] items-center justify-center rounded-[8px] ${mine ? "bg-[#b2f2d0]" : "bg-[#f0f2f5]"}`}
          style={att.width && att.height ? { aspectRatio: `${att.width}/${att.height}` } : undefined}
        >
          <div className="text-center">
            <div className="text-3xl">🖼️</div>
            <div className="mt-1 text-[11px] text-[#667781]">
              {att.width && att.height ? `${att.width} × ${att.height}` : "图片"}
            </div>
          </div>
        </div>
      )}
      {caption ? <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6">{caption}</div> : null}
    </div>
  );
}

/** Video message — native video element with poster fallback. */
function VideoBody({ att, caption, token }: { att: WaAttachment; caption: string | null; token: string }) {
  const url = mediaProxyUrl(att, token);
  const duration = fmtDuration(att.durationMs);

  return (
    <div className="max-w-[280px]">
      {url ? (
        <video
          src={url}
          controls
          preload="metadata"
          className="block max-h-[300px] w-full rounded-[8px] bg-black"
        />
      ) : (
        <div className="flex h-[160px] items-center justify-center rounded-[8px] bg-black/10">
          <div className="text-center">
            <div className="text-3xl">▶️</div>
            {duration !== "0:00" && <div className="mt-1 text-[11px] text-[#667781]">{duration}</div>}
          </div>
        </div>
      )}
      <div className="mt-1 flex items-center gap-2 text-[11px] text-[#667781]">
        {duration !== "0:00" && <span>🎬 {duration}</span>}
        {att.fileSize ? <span>{fmtSize(att.fileSize)}</span> : null}
      </div>
      {caption ? <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6">{caption}</div> : null}
    </div>
  );
}

/** Audio / voice-note message — native audio element with waveform decoration. */
function AudioBody({ att, token }: { att: WaAttachment; token: string }) {
  const url = mediaProxyUrl(att, token);
  const duration = fmtDuration(att.durationMs);
  const isVoice = (att.mimeType ?? "").includes("ogg") || (att.mimeType ?? "").includes("opus");

  return (
    <div className="flex min-w-[200px] max-w-[280px] items-center gap-3 py-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white text-lg">
        {isVoice ? "🎤" : "🎵"}
      </div>
      <div className="min-w-0 flex-1">
        {url ? (
          <audio src={url} controls preload="metadata" className="h-8 w-full" />
        ) : (
          /* Fake waveform bars when no URL is available */
          <div className="flex h-8 items-end gap-[2px]">
            {[3, 5, 8, 6, 10, 7, 4, 8, 5, 3, 6, 9, 7, 4, 5, 8, 6, 3].map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-sm bg-[#8696a0] opacity-60"
                style={{ height: `${h * 2}px` }}
              />
            ))}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-[#667781]">
          {duration !== "0:00" ? duration : "语音消息"}
        </div>
      </div>
    </div>
  );
}

/** Document / file message — file card with icon, name, size and download. */
function DocumentBody({ att, caption, token }: { att: WaAttachment; caption: string | null; token: string }) {
  const url = mediaProxyUrl(att, token);
  const icon = docIcon(att.mimeType, att.fileName);
  const name = att.fileName || "文件";
  const size = fmtSize(att.fileSize);

  return (
    <div className="min-w-[200px] max-w-[280px]">
      <div className="flex items-center gap-3 rounded-[8px] bg-black/[0.04] px-3 py-3">
        <div className="text-3xl leading-none">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-5">{name}</div>
          {size ? <div className="text-[11px] text-[#667781]">{size}</div> : null}
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            download={att.fileName || true}
            className="shrink-0 rounded-full bg-[#00a884] p-2 text-white hover:bg-[#017a61]"
            title="下载"
          >
            ↓
          </a>
        ) : null}
      </div>
      {caption ? <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6">{caption}</div> : null}
    </div>
  );
}

/** Sticker — transparent, no bubble background. */
function StickerBody({ att, token }: { att: WaAttachment; token: string }) {
  const [failed, setFailed] = useState(false);
  const url = mediaProxyUrl(att, token);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt="贴纸"
        className="max-h-[160px] max-w-[160px] object-contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return <div className="text-3xl">🎭</div>;
}

/** Location — map thumbnail with link to Google Maps. */
function LocationBody({ att, token }: { att: WaAttachment; token: string }) {
  const lat = att.width;  // stored lat in width field
  const lng = att.height; // stored lng in height field
  const name = att.fileName;
  const mapsUrl = att.storageUrl; // Google Maps URL (plain text, not encrypted)
  const thumbUrl = att.previewUrl ? mediaProxyUrl({ ...att, storageUrl: att.previewUrl, previewUrl: null }, token) : null;

  return (
    <div className="max-w-[240px]">
      {thumbUrl ? (
        <img src={thumbUrl} alt="位置" className="mb-2 w-full rounded-[8px] object-cover" />
      ) : (
        <div className="mb-2 flex h-[100px] items-center justify-center rounded-[8px] bg-[#e8f5e9]">
          <span className="text-3xl">📍</span>
        </div>
      )}
      {name && <div className="text-[13px] font-medium leading-5">{name}</div>}
      {lat != null && lng != null && (
        <div className="text-[11px] text-[#667781]">{lat.toFixed(5)}, {lng.toFixed(5)}</div>
      )}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-1 block text-[12px] text-[#00a884] underline-offset-2 hover:underline">
          在地图中查看
        </a>
      )}
    </div>
  );
}

/** Reaction message — shown as a tiny center-aligned pill, not a regular bubble. */
function ReactionPill({ message }: { message: WaMessageItem }) {
  const emoji = message.bodyText || "👍";
  const actor = message.senderDisplayName || message.senderJid?.split("@")[0] || "对方";
  return (
    <div className="my-1 flex justify-center">
      <div className="rounded-full bg-white/70 px-3 py-1 text-[11px] text-[#667781] shadow-sm">
        {actor} 回应了 <span className="text-base leading-none">{emoji}</span>
      </div>
    </div>
  );
}

/** Revoked / deleted message. */
function RevokedBody({ mine }: { mine: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[13px] italic ${mine ? "text-[#075e54]/60" : "text-[#667781]"}`}>
      <span>🚫</span>
      <span>此消息已被撤回</span>
    </div>
  );
}

/** Contact card placeholder. */
function ContactCardBody({ message }: { message: WaMessageItem }) {
  const name = message.bodyText || "联系人";
  return (
    <div className="flex items-center gap-3 rounded-[8px] bg-black/[0.04] px-3 py-3 max-w-[240px]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d1d7db] text-lg">👤</div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{name}</div>
        <div className="text-[11px] text-[#667781]">联系人名片</div>
      </div>
    </div>
  );
}

/** Unknown / unsupported message type fallback. */
function UnsupportedBody({ messageType }: { messageType: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] italic text-[#667781]">
      <span>⚠️</span>
      <span>此消息类型暂不支持（{messageType}）</span>
    </div>
  );
}

// ─── Reactions chip bar ───────────────────────────────────────────────────────

function ReactionsBar({ reactions }: { reactions: WaReaction[] }) {
  if (!reactions.length) return null;
  // Group by emoji and count
  const counts = new Map<string, number>();
  for (const r of reactions) {
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[...counts.entries()].map(([emoji, count]) => (
        <span
          key={emoji}
          className="inline-flex items-center gap-0.5 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[12px] shadow-sm"
        >
          <span>{emoji}</span>
          {count > 1 && <span className="text-[10px] text-[#667781]">{count}</span>}
        </span>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WaChatPanel(props: WaChatPanelProps) {
  const {
    session,
    detail,
    detailLoading,
    firstUnreadCount,
    hasMoreMessages,
    loadingMoreMessages,
    onLoadMoreMessages,
    composerText,
    onComposerTextChange,
    quotedMessage,
    onClearQuoted,
    uploadingAttachments,
    onRemoveAttachment,
    onUploadFiles,
    onTakeover,
    onRelease,
    onReplyToMessage,
    onSendReaction,
    onSend,
    actionLoading
  } = props;

  const token = session.accessToken;

  const title =
    detail?.conversation.displayName ||
    detail?.conversation.subject ||
    detail?.conversation.contactJid ||
    detail?.conversation.chatJid ||
    "选择会话";
  const currentReplier = detail?.conversation.currentReplierName || "未接管";
  const headerMeta = detail?.conversation.conversationType === "group"
    ? `${detail.members.length} 位成员`
    : detail?.conversation.contactPhoneE164 || detail?.conversation.contactJid || "单聊";

  // ── Scroll ────────────────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  // When prepending older messages, restore scroll position so the user stays at the same spot.
  const prevScrollHeightRef = useRef<number>(0);
  const isPrependRef = useRef(false);

  const conversationId = detail?.conversation.waConversationId ?? null;
  const messagesLength = detail?.messages.length ?? 0;

  useLayoutEffect(() => {
    if (!messagesLength) return;
    const isConversationSwitch = conversationId !== prevConversationIdRef.current;
    const isNewMessage = !isConversationSwitch && !isPrependRef.current && messagesLength > prevMessagesLengthRef.current;
    const wasPrepend = isPrependRef.current;
    prevConversationIdRef.current = conversationId;
    prevMessagesLengthRef.current = messagesLength;
    isPrependRef.current = false;

    if (wasPrepend) {
      // Restore scroll position after prepending older messages
      const container = scrollContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
      }
    } else if (isConversationSwitch) {
      if (firstUnreadCount > 0 && unreadDividerRef.current) {
        unreadDividerRef.current.scrollIntoView({ behavior: "instant", block: "start" });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }
    } else if (isNewMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationId, messagesLength, firstUnreadCount]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleLoadMore = useCallback(() => {
    const container = scrollContainerRef.current;
    prevScrollHeightRef.current = container?.scrollHeight ?? 0;
    isPrependRef.current = true;
    onLoadMoreMessages();
  }, [onLoadMoreMessages]);

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    onUploadFiles(event.target.files);
    event.target.value = "";
  };

  const renderDeliveryStatus = (message: WaMessageItem) => {
    if (message.direction !== "outbound") return null;
    const s = message.receiptSummary?.latestStatus || message.deliveryStatus;
    if (s === "read") return <span className="text-[#53bdeb]">✓✓</span>;
    if (s === "delivered") return <span>✓✓</span>;
    if (s === "server_ack") return <span>✓</span>;
    if (s === "failed") return <span className="text-[#f15c6d]">!</span>;
    if (s === "pending") return <span className="opacity-40">🕐</span>;
    return <span className="opacity-60">✓</span>;
  };

  const bubbleTimestamp = (message: WaMessageItem) =>
    new Date(message.providerTs || message.createdAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });

  // ── Paste handler ─────────────────────────────────────────────────────────

  const handleComposerPaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      // Check if any of the pasted items are images (or other files)
      const hasFile = Array.from(files).some((f) => f.size > 0);
      if (hasFile) {
        e.preventDefault();
        onUploadFiles(files);
      }
    }
  }, [onUploadFiles]);

  // ── Message body dispatcher ───────────────────────────────────────────────

  const renderMessageBody = (message: WaMessageItem, mine: boolean) => {
    // Revoked first
    if (message.deliveryStatus === "revoked") return <RevokedBody mine={mine} />;

    const { messageType, bodyText, attachments } = message;
    const att = attachments[0] ?? null;

    switch (messageType) {
      case "image":
        return att
          ? <ImageBody att={att} caption={bodyText} mine={mine} token={token} />
          : bodyText ? <div className="whitespace-pre-wrap text-[14px] leading-6">{bodyText}</div> : <UnsupportedBody messageType="image (无附件)" />;

      case "video":
        return att
          ? <VideoBody att={att} caption={bodyText} token={token} />
          : bodyText ? <div className="whitespace-pre-wrap text-[14px] leading-6">{bodyText}</div> : <UnsupportedBody messageType="video (无附件)" />;

      case "audio":
        return att
          ? <AudioBody att={att} token={token} />
          : <UnsupportedBody messageType="audio (无附件)" />;

      case "document":
        return att
          ? <DocumentBody att={att} caption={bodyText} token={token} />
          : bodyText ? <div className="whitespace-pre-wrap text-[14px] leading-6">{bodyText}</div> : <UnsupportedBody messageType="document (无附件)" />;

      case "sticker":
        return att ? <StickerBody att={att} token={token} /> : <div className="text-3xl">🎭</div>;

      case "location":
        return att ? <LocationBody att={att} token={token} /> : <UnsupportedBody messageType="location" />;

      case "contact_card":
        return <ContactCardBody message={message} />;

      case "text":
      default:
        if (bodyText) return <div className="whitespace-pre-wrap text-[14px] leading-6">{bodyText}</div>;
        if (att) return <DocumentBody att={att} caption={null} token={token} />; // fallback
        // messageType === "text" with no body and no attachment: could be an interactive
        // message type whose text wasn't extracted, or genuinely empty.
        if (messageType === "text") {
          return <div className="text-[13px] italic text-[#667781]">（消息内容加载中或格式未知）</div>;
        }
        return <UnsupportedBody messageType={messageType} />;
    }
  };

  // ── Data ──────────────────────────────────────────────────────────────────

  const messages = detail?.messages ?? [];
  const firstUnreadIndex =
    firstUnreadCount > 0 ? Math.max(0, messages.length - firstUnreadCount) : -1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#efeae2]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d9fdd3] text-sm font-semibold text-[#005c4b]">
              {detail?.conversation.conversationType === "group" ? "+" : title.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[16px] font-medium text-[#111b21]">{title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[#667781]">
                <span>{headerMeta}</span>
                <span>·</span>
                <span>{currentReplier}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button" onClick={onTakeover}
              disabled={!detail || actionLoading !== null}
              className="h-8 rounded-full border border-[#d1d7db] bg-white px-3 text-xs font-medium text-[#111b21] transition-colors hover:bg-[#f5f6f6] disabled:opacity-50"
            >
              {actionLoading === "takeover" ? "接管中..." : "接管"}
            </button>
            <button
              type="button" onClick={onRelease}
              disabled={!detail || actionLoading !== null}
              className="h-8 rounded-full bg-[#00a884] px-3 text-xs font-medium text-white transition-colors hover:bg-[#017561] disabled:opacity-50"
            >
              {actionLoading === "release" ? "释放中..." : "释放"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Message list ─────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-auto px-6 py-5"
        style={{
          backgroundColor: "#efeae2",
          backgroundImage:
            "radial-gradient(rgba(11,20,26,0.035) 1px, transparent 1px), linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04))",
          backgroundSize: "18px 18px, auto"
        }}
      >
        {detailLoading ? <div className="text-sm text-[#667781]">会话加载中...</div> : null}
        {/* ── Load more button (top of list) ─────────────────────────── */}
        {hasMoreMessages && !detailLoading ? (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMoreMessages}
              className="rounded-full bg-white/80 px-4 py-2 text-[12px] font-medium text-[#54656f] shadow-sm hover:bg-white disabled:opacity-50"
            >
              {loadingMoreMessages ? "加载中..." : "加载更多历史消息"}
            </button>
          </div>
        ) : null}
        <div className="space-y-1">
          {messages.map((message, index) => {
            const mine = message.direction === "outbound";
            const isReaction = message.messageType === "reaction";
            const isSticker = message.messageType === "sticker";

            // Quoted message lookup
            const quotedTarget = message.quotedMessageId
              ? messages.find((m) => m.providerMessageId === message.quotedMessageId || m.waMessageId === message.quotedMessageId) ?? null
              : null;

            // Sender label (groups only, inbound)
            const senderLabel = !mine && detail?.conversation.conversationType === "group"
              ? (message.senderDisplayName || message.participantJid?.split("@")[0] || null)
              : null;

            // Preview text for reply quote
            const previewText = message.bodyText
              || message.attachments[0]?.fileName
              || message.messageType;

            return (
              <div key={message.waMessageId}>
                {/* ── Unread divider ─────────────────────────────── */}
                {index === firstUnreadIndex ? (
                  <div ref={unreadDividerRef} className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#c9b99a]" />
                    <span className="rounded-full bg-[#fbf3d5] px-3 py-1 text-[11px] font-medium text-[#75591c] shadow-sm">
                      {firstUnreadCount} 条未读消息
                    </span>
                    <div className="h-px flex-1 bg-[#c9b99a]" />
                  </div>
                ) : null}

                {/* ── Reaction pill (no bubble) ───────────────────── */}
                {isReaction ? (
                  <ReactionPill message={message} />
                ) : (
                  /* ── Regular message bubble ────────────────────── */
                  <div className={`group my-2 flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={
                        isSticker
                          // Stickers: transparent, no bubble background
                          ? "max-w-[180px]"
                          : `max-w-[72%] rounded-[12px] px-3 py-2 shadow-[0_1px_2px_rgba(11,20,26,0.12)] ${mine ? "bg-[#d9fdd3] text-[#111b21]" : "bg-white text-[#111b21]"}`
                      }
                    >
                      {/* Sender name (groups) */}
                      {senderLabel ? (
                        <div className="mb-1 text-[12px] font-semibold text-[#0b8457]">{senderLabel}</div>
                      ) : null}

                      {/* Quoted reply preview */}
                      {message.quotedMessageId ? (
                        <div className={`mb-2 rounded-lg border-l-4 px-3 py-2 text-xs ${mine ? "border-[#53bdeb] bg-[#f0f2f5]" : "border-[#00a884] bg-[#f5f6f6]"}`}>
                          <div className="text-[11px] font-medium text-[#54656f]">
                            {quotedTarget?.senderDisplayName || "引用消息"}
                          </div>
                          <div className="mt-0.5 truncate text-[#111b21]">
                            {quotedTarget?.bodyText || quotedTarget?.attachments[0]?.fileName || "媒体消息"}
                          </div>
                        </div>
                      ) : null}

                      {/* Message body — dispatched by type */}
                      {renderMessageBody(message, mine)}

                      {/* Failed send banner */}
                      {mine && message.deliveryStatus === "failed" ? (
                        <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#f15c6d]/10 px-2 py-1.5 text-[12px] text-[#f15c6d]">
                          <span>⚠️</span>
                          <span className="font-medium">发送失败</span>
                        </div>
                      ) : null}

                      {/* Reactions chips below content */}
                      {!isSticker && message.reactions.length > 0 ? (
                        <ReactionsBar reactions={message.reactions} />
                      ) : null}

                      {/* Timestamp + delivery status + action buttons */}
                      {!isSticker ? (
                        <div className="mt-1.5 flex items-center justify-between gap-3">
                          {/* Hover action buttons */}
                          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            {/* Disable reply on failed outbound messages — they have no providerMessageId
                                so Baileys cannot build a proper quote context. */}
                            {!(mine && message.deliveryStatus === "failed" && !message.providerMessageId) && (
                              <button
                                type="button"
                                className="rounded-full px-2 py-0.5 text-[11px] text-[#54656f] hover:bg-black/5"
                                onClick={() => onReplyToMessage(message)}
                              >
                                回复
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-full px-2 py-0.5 text-[11px] text-[#54656f] hover:bg-black/5"
                              onClick={() => onSendReaction(message, "👍")}
                            >
                              👍
                            </button>
                          </div>
                          {/* Timestamp + tick */}
                          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-[#667781]">
                            <span>{bubbleTimestamp(message)}</span>
                            {renderDeliveryStatus(message)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!detailLoading && !messages.length ? (
            <div className="mx-auto mt-12 max-w-md rounded-[12px] bg-white px-5 py-4 text-center text-sm text-[#667781] shadow-sm">
              这个聊天暂时还没有消息
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────── */}
      <div className="border-t border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
        {quotedMessage ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-[12px] border border-[#b7e4d7] bg-[#ebfff7] px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#008069]">引用回复</div>
              <div className="truncate text-xs text-[#54656f]">
                {quotedMessage.bodyText || quotedMessage.attachments[0]?.fileName || quotedMessage.messageType}
              </div>
            </div>
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] text-[#008069] hover:bg-[#dff8ef]"
              onClick={onClearQuoted}
              title="取消引用"
            >
              ✕
            </button>
          </div>
        ) : null}

        {uploadingAttachments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadingAttachments.map((att) => {
              const isImage = att.mimeType.startsWith("image/");
              const previewSrc = isImage ? `${API_BASE_URL}${att.url}` : null;
              return (
                <div
                  key={att.localId}
                  className="relative flex items-center gap-2 overflow-hidden rounded-[10px] border border-[#d1d7db] bg-white text-xs text-[#54656f]"
                >
                  {previewSrc ? (
                    /* Image thumbnail */
                    <div className="relative h-16 w-16 shrink-0">
                      <img
                        src={previewSrc}
                        alt={att.fileName}
                        className="h-full w-full rounded-l-[9px] object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center text-xl">
                      {docIcon(att.mimeType, att.fileName)}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-2">
                    <span className="max-w-[120px] truncate font-medium">{att.fileName}</span>
                    <span className="text-[10px] text-[#667781]">{att.mimeType.split("/")[1]?.toUpperCase()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.localId)}
                    className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-[10px] text-white hover:bg-black/80"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-end gap-3">
          <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-[#d1d7db] bg-white px-4 text-xs text-[#54656f] transition-colors hover:bg-[#f5f6f6]">
            <span>📎</span>
            <span>附件</span>
            <input type="file" multiple className="hidden" onChange={handleFileInput} />
          </label>
          <textarea
            value={composerText}
            onChange={(event) => onComposerTextChange(event.target.value)}
            placeholder="输入消息内容，或粘贴图片"
            rows={1}
            className="min-h-[44px] max-h-[140px] flex-1 resize-none rounded-[12px] border border-[#d1d7db] bg-white px-4 py-3 text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            onPaste={handleComposerPaste}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!detail?.permissions.canReply || actionLoading !== null}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-lg text-white transition-colors hover:bg-[#017a61] disabled:opacity-50"
          >
            {actionLoading === "send" ? "…" : "➤"}
          </button>
        </div>
        {detail && !detail.permissions.canReply ? (
          <div className="mt-2 text-xs text-[#f15c6d]">当前由其他成员接管，无法发送消息</div>
        ) : null}
      </div>
    </div>
  );
}
