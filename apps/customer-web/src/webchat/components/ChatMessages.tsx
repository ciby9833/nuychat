import type { WebchatMessage } from "../types";
import { useEffect, useMemo, useState } from "react";
import { resolveApiBase } from "../config";

const API_BASE = resolveApiBase();

function resolveAttachmentUrl(url?: string, dataUrl?: string) {
  if (dataUrl) return dataUrl;
  if (!url) return undefined;
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  return new URL(url, API_BASE).toString();
}

export function ChatMessages(props: { messages: WebchatMessage[]; loading: boolean }) {
  const [typedContent, setTypedContent] = useState<Record<string, string>>({});
  const [imagePreview, setImagePreview] = useState<{ url: string; alt: string } | null>(null);

  const newestOutbound = useMemo(() => {
    const rows = [...props.messages].reverse();
    return rows.find((item) => item.direction === "outbound" && item.text) ?? null;
  }, [props.messages]);

  useEffect(() => {
    if (!newestOutbound || !newestOutbound.text) return;
    const target = newestOutbound.text;
    const current = typedContent[newestOutbound.id] ?? "";
    if (current === target) return;

    let cursor = current.length;
    const timer = window.setInterval(() => {
      cursor += 2;
      const next = target.slice(0, cursor);
      setTypedContent((prev) => ({ ...prev, [newestOutbound.id]: next }));
      if (next.length >= target.length) {
        window.clearInterval(timer);
      }
    }, 12);

    return () => window.clearInterval(timer);
  }, [newestOutbound, typedContent]);

  return (
    <main className="chat-messages">
      {props.messages.length === 0 && !props.loading ? (
        <div className="chat-empty">欢迎咨询，消息发送后客服或 AI 将尽快回复。</div>
      ) : null}
      {props.messages.map((message) => {
        const outbound = message.direction === "outbound";
        const text = outbound ? (typedContent[message.id] ?? message.text) : message.text;
        return (
          <div key={message.id} className={`bubble-row ${outbound ? "outbound" : "inbound"}`}>
            <div className="bubble">
              <p>{text || "[非文本消息]"}</p>
              {message.attachments?.length ? (
                <div className="bubble-attachments">
                  {message.attachments.map((file, idx) => {
                    const fileUrl = resolveAttachmentUrl(file.url, file.dataUrl);
                    const isImage = file.mimeType.startsWith("image/");

                    return (
                      <a
                        key={`${message.id}-${idx}`}
                        className="bubble-file"
                        href={fileUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => {
                          if (!isImage || !fileUrl) return;
                          event.preventDefault();
                          setImagePreview({ url: fileUrl, alt: file.name });
                        }}
                      >
                        {isImage && fileUrl ? (
                          <img src={fileUrl} alt={file.name} />
                        ) : null}
                        <span>{file.name}</span>
                      </a>
                    );
                  })}
                </div>
              ) : null}
              <time>{new Date(message.createdAt).toLocaleString()}</time>
            </div>
          </div>
        );
      })}
      {imagePreview ? (
        <div
          className="image-preview-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            className="image-preview-close"
            aria-label="关闭图片预览"
            onClick={() => setImagePreview(null)}
          >
            ×
          </button>
          <img
            src={imagePreview.url}
            alt={imagePreview.alt}
            className="image-preview-content"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </main>
  );
}
