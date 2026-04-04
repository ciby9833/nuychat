/**
 * 功能名称: 结构化消息内容渲染
 * 菜单路径: 座席工作台 / 消息 / 会话详情
 * 文件职责: 统一渲染文本、结构化 blocks 与附件内容，供消息时间线和任务会话预览复用。
 * 交互页面:
 * - ./MessageList.tsx: 消息工作台的气泡内容渲染。
 * - ./tasks/TaskConversationPreviewModal.tsx: 任务页会话上下文预览。
 */

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { resolveApiUrl } from "../api";

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

export function StructuredMessageContent(props: {
  structured?: StructuredMessage | null;
  fallbackText?: string;
  attachments?: Array<{ url?: string; mimeType?: string; fileName?: string; mediaId?: string }>;
}) {
  const { t } = useTranslation();
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const blocks = Array.isArray(props.structured?.blocks) ? props.structured.blocks : [];
  const attachments = Array.isArray(props.attachments) ? props.attachments : [];
  const hasText = Boolean(props.fallbackText);
  const hasBlocks = blocks.length > 0;
  const hasAttachments = attachments.length > 0;

  if (!hasText && !hasBlocks && !hasAttachments) return null;

  return (
    <>
      <div className="flex flex-col gap-3">
        {hasBlocks
          ? blocks.map((block, index) => (
              <div key={`${block.type}-${index}`}>{renderBlock(block)}</div>
            ))
          : hasText
            ? <span className="whitespace-pre-wrap break-words">{props.fallbackText}</span>
            : null}

        {hasAttachments ? (
          <div className="flex flex-col gap-2">
            {attachments.map((attachment, index) => (
              <div key={`${attachment.url ?? attachment.fileName ?? "attachment"}-${index}`}>
                {renderAttachment(attachment, t, (url, alt) => setPreviewImage({ url, alt }))}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {previewImage ? (
        <div className="image-preview-overlay" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <button
            type="button"
            className="image-preview-close"
            onClick={() => setPreviewImage(null)}
          >
            ×
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.alt}
            className="image-preview-content"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

function renderAttachment(
  attachment: { url?: string; mimeType?: string; fileName?: string },
  t: (key: string) => string,
  onPreviewImage: (url: string, alt: string) => void
): ReactNode {
  const mimeType = attachment.mimeType ?? "";
  const url = attachment.url ? resolveApiUrl(attachment.url) : undefined;

  if (url && mimeType.startsWith("image/")) {
    return (
      <img
        src={url}
        alt={attachment.fileName ?? "image"}
        className={mimeType === "image/webp" ? "bubble-img bubble-sticker" : "bubble-img"}
        loading="lazy"
        onClick={() => onPreviewImage(url, attachment.fileName ?? "image")}
      />
    );
  }

  if (url && mimeType.startsWith("video/")) {
    return <video src={url} controls className="bubble-video" preload="metadata" />;
  }

  if (url && mimeType.startsWith("audio/")) {
    return <audio src={url} controls className="bubble-audio" preload="metadata" />;
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-lg">{fileEmoji(attachment.fileName, mimeType)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-700">{attachment.fileName ?? t("tasksWorkspace.preview.attachmentFallback")}</div>
        <div className="truncate text-xs text-slate-400">{mimeType || "unknown"}</div>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">
          {t("tasksWorkspace.preview.openAttachment")}
        </a>
      ) : null}
    </div>
  );
}

function fileEmoji(fileName: string | undefined, mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎞️";
  if (mimeType.startsWith("audio/")) return "🎵";
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["zip", "rar", "7z"].includes(ext)) return "📦";
  return "📎";
}

function renderBlock(block: StructuredMessageBlock): ReactNode {
  if (block.type === "paragraph") {
    return <div className="whitespace-pre-wrap break-words">{block.text}</div>;
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag className={block.ordered ? "list-decimal pl-5 space-y-1" : "list-disc pl-5 space-y-1"}>
        {block.items.map((item, index) => (
          <li key={`${item}-${index}`} className="whitespace-pre-wrap break-words">{item}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "key_value") {
    return (
      <div className="grid gap-2">
        {block.items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="grid gap-1">
            <div className="text-xs font-medium opacity-70">{item.label}</div>
            <div className="whitespace-pre-wrap break-words">{item.value}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {block.items.map((record, recordIndex) => (
        <div key={`${record.title ?? "record"}-${recordIndex}`} className="rounded-xl border border-slate-200/80 p-3">
          {record.title ? <div className="mb-2 text-sm font-semibold">{record.title}</div> : null}
          <div className="grid gap-2">
            {record.fields.map((field, fieldIndex) => (
              <div key={`${field.label}-${fieldIndex}`} className="grid gap-1">
                <div className="text-xs font-medium opacity-70">{field.label}</div>
                <div className="whitespace-pre-wrap break-words">{field.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
