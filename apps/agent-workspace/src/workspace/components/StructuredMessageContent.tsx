// 作用：人工座席工作台消息时间线渲染统一 structured 消息。
// 页面：座席工作台 / 会话详情 / 消息列表

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

export function StructuredMessageContent(props: {
  structured?: StructuredMessage | null;
  fallbackText?: string;
}) {
  const blocks = Array.isArray(props.structured?.blocks) ? props.structured.blocks : [];
  if (blocks.length === 0) {
    return props.fallbackText ? <span>{props.fallbackText}</span> : null;
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => (
        <div key={`${block.type}-${index}`}>{renderBlock(block)}</div>
      ))}
    </div>
  );
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
