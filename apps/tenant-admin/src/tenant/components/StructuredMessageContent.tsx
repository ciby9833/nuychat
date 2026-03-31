// 作用：租户管理端统一渲染 structured 消息和消息附件。
// 页面：AI 会话监控 / 人工会话详情

import type { ReactNode } from "react";

type StructuredMessageField = {
  label: string;
  value: string;
};

type StructuredMessageRecord = {
  title?: string;
  fields: StructuredMessageField[];
};

type StructuredMessageBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "key_value"; items: StructuredMessageField[] }
  | { type: "records"; items: StructuredMessageRecord[] };

type StructuredMessage = {
  version: "2026-03-28";
  blocks: StructuredMessageBlock[];
};

type MessageAttachment = {
  url?: string;
  fileName?: string;
  mimeType?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function StructuredMessageContent(props: {
  structured?: StructuredMessage | null;
  fallbackText?: string;
  attachments?: MessageAttachment[] | null;
}) {
  const blocks = Array.isArray(props.structured?.blocks) ? props.structured.blocks : [];
  const attachments = Array.isArray(props.attachments) ? props.attachments : [];

  if (blocks.length === 0 && attachments.length === 0) {
    return props.fallbackText ? <span>{props.fallbackText}</span> : null;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {attachments.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {attachments.map((attachment, index) => renderAttachment(attachment, index))}
        </div>
      ) : null}
      {blocks.map((block, index) => (
        <div key={`${block.type}-${index}`}>{renderBlock(block)}</div>
      ))}
      {blocks.length === 0 && props.fallbackText ? (
        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{props.fallbackText}</span>
      ) : null}
    </div>
  );
}

function renderAttachment(attachment: MessageAttachment, index: number): ReactNode {
  const rawUrl = attachment.url;
  const resolvedUrl = rawUrl
    ? (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
        ? rawUrl
        : `${API_BASE}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`)
    : undefined;
  const mimeType = attachment.mimeType ?? "";
  const fileName = attachment.fileName ?? attachment.url ?? `attachment-${index + 1}`;

  if (mimeType.startsWith("image/") && resolvedUrl) {
    return (
      <a
        key={`${fileName}-${index}`}
        href={resolvedUrl}
        target="_blank"
        rel="noreferrer"
        style={{ display: "inline-flex", width: "fit-content" }}
      >
        <img
          src={resolvedUrl}
          alt={fileName}
          style={{
            maxWidth: 240,
            maxHeight: 240,
            borderRadius: 12,
            border: "1px solid #e8e8e8",
            objectFit: "cover"
          }}
        />
      </a>
    );
  }

  return (
    <div
      key={`${fileName}-${index}`}
      style={{
        display: "grid",
        gap: 4,
        border: "1px solid #e8e8e8",
        borderRadius: 12,
        padding: 10
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>{fileName}</div>
      {mimeType ? <div style={{ fontSize: 12, opacity: 0.7 }}>{mimeType}</div> : null}
      {resolvedUrl ? (
        <a href={resolvedUrl} target="_blank" rel="noreferrer">
          查看附件
        </a>
      ) : null}
    </div>
  );
}

function renderBlock(block: StructuredMessageBlock): ReactNode {
  if (block.type === "paragraph") {
    return <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{block.text}</div>;
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
        {block.items.map((item, index) => (
          <li key={`${item}-${index}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "key_value") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {block.items.map((item, index) => (
          <div key={`${item.label}-${index}`} style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{item.label}</div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.value}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {block.items.map((record, recordIndex) => (
        <div
          key={`${record.title ?? "record"}-${recordIndex}`}
          style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}
        >
          {record.title ? <div style={{ fontSize: 13, fontWeight: 600 }}>{record.title}</div> : null}
          <div style={{ display: "grid", gap: 8 }}>
            {record.fields.map((field, fieldIndex) => (
              <div key={`${field.label}-${fieldIndex}`} style={{ display: "grid", gap: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{field.label}</div>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{field.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
