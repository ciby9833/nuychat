import type { WebchatMessage } from "../types";
import { useEffect, useMemo, useState } from "react";

export function ChatMessages(props: { messages: WebchatMessage[]; loading: boolean }) {
  const [typedContent, setTypedContent] = useState<Record<string, string>>({});

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
                  {message.attachments.map((file, idx) => (
                    <a
                      key={`${message.id}-${idx}`}
                      className="bubble-file"
                      href={file.url || file.dataUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.mimeType.startsWith("image/") && (file.url || file.dataUrl) ? (
                        <img src={file.url || file.dataUrl} alt={file.name} />
                      ) : null}
                      <span>{file.name}</span>
                    </a>
                  ))}
                </div>
              ) : null}
              <time>{new Date(message.createdAt).toLocaleString()}</time>
            </div>
          </div>
        );
      })}
    </main>
  );
}
