// 作用：统一处理 structured 消息的标准化、自动结构化和文本降级。
// 功能：消息发布链 / 技能脚本结果 / 多渠道发送

import type {
  StructuredMessage,
  StructuredMessageAction,
  StructuredMessageBlock,
  StructuredMessageField,
  StructuredMessageRecord
} from "../types/structured-message.js";

const CONTROL_KEYS = ["action", "response", "handoffReason", "intent", "sentiment", "confidence"];

export function normalizeStructuredMessage(value: unknown): StructuredMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== "2026-03-28" || !Array.isArray(record.blocks)) return null;

  const blocks = record.blocks
    .map(normalizeBlock)
    .filter((block): block is StructuredMessageBlock => Boolean(block));

  if (blocks.length === 0) return null;

  const actions = Array.isArray(record.actions)
    ? record.actions.map(normalizeAction).filter((action): action is StructuredMessageAction => Boolean(action))
    : [];

  return {
    version: "2026-03-28",
    blocks,
    actions: actions.length > 0 ? actions : undefined
  };
}

export function normalizeStructuredActions(value: unknown): StructuredMessageAction[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAction).filter((action): action is StructuredMessageAction => Boolean(action));
}

export function inferStructuredMessageFromText(text: string): StructuredMessage | null {
  const normalized = text.trim();
  if (!normalized || isInternalControlPayload(normalized)) return null;

  const sections = normalized
    .split(/\n\s*\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const blocks = sections
    .map(inferBlockFromSection)
    .filter((block): block is StructuredMessageBlock => Boolean(block));

  if (blocks.length === 0) return null;

  return {
    version: "2026-03-28",
    blocks
  };
}

export function inferStructuredMessageFromExecutionPayload(payload: unknown, fallbackText?: string): StructuredMessage | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallbackText ? inferStructuredMessageFromText(fallbackText) : null;
  }

  const record = payload as Record<string, unknown>;
  const direct = normalizeStructuredMessage(record.structured);
  if (direct) return direct;

  const response = normalizeExecutionResponse(record.response);
  if (response) {
    return {
      version: "2026-03-28",
      blocks: response.blocks,
      actions: response.actions.length > 0 ? response.actions : undefined
    };
  }

  const textCandidate =
    readString(record.customerReply) ??
    readString(record.text) ??
    fallbackText ??
    "";

  return inferStructuredMessageFromText(textCandidate);
}

export function structuredToPlainText(structured: StructuredMessage | null, fallbackText = ""): string {
  if (!structured) return fallbackText.trim();

  const sections = structured.blocks
    .map(blockToPlainText)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) return fallbackText.trim();
  return sections.join("\n\n");
}

export function isInternalControlPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const keys = Object.keys(parsed as Record<string, unknown>);
    if (keys.length === 0) return false;
    return keys.every((key) => CONTROL_KEYS.includes(key));
  } catch {
    return false;
  }
}

function normalizeBlock(value: unknown): StructuredMessageBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const type = readString(record.type);
  if (!type) return null;

  if (type === "paragraph") {
    const text = readString(record.text);
    return text ? { type: "paragraph", text } : null;
  }

  if (type === "list") {
    const items = Array.isArray(record.items)
      ? record.items.map(readString).filter((item): item is string => Boolean(item))
      : [];
    if (items.length === 0) return null;
    return {
      type: "list",
      ordered: Boolean(record.ordered),
      items
    };
  }

  if (type === "key_value") {
    const items = Array.isArray(record.items)
      ? record.items.map(normalizeField).filter((item): item is StructuredMessageField => Boolean(item))
      : [];
    return items.length > 0 ? { type: "key_value", items } : null;
  }

  if (type === "records") {
    const items = Array.isArray(record.items)
      ? record.items.map(normalizeRecord).filter((item): item is StructuredMessageRecord => Boolean(item))
      : [];
    return items.length > 0 ? { type: "records", items } : null;
  }

  return null;
}

function normalizeField(value: unknown): StructuredMessageField | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const label = readString(record.label);
  const fieldValue = readString(record.value);
  if (!label || !fieldValue) return null;
  return { label, value: fieldValue };
}

function normalizeRecord(value: unknown): StructuredMessageRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const fields = Array.isArray(record.fields)
    ? record.fields.map(normalizeField).filter((item): item is StructuredMessageField => Boolean(item))
    : [];
  if (fields.length === 0) return null;
  return {
    title: readString(record.title) ?? undefined,
    fields
  };
}

function normalizeAction(value: unknown): StructuredMessageAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const label = readString(record.label);
  const actionValue = readString(record.value);
  if (!label || !actionValue) return null;
  const type = readString(record.type);
  return {
    type: type === "button" || type === "list" || type === "postback" ? type : undefined,
    label,
    value: actionValue
  };
}

function inferBlockFromSection(section: string): StructuredMessageBlock | null {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const keyValueItems = lines.map(parseKeyValueLine).filter((item): item is StructuredMessageField => Boolean(item));
  if (keyValueItems.length >= 2 && keyValueItems.length === lines.length) {
    return { type: "key_value", items: keyValueItems };
  }

  const orderedItems = lines
    .map((line) => line.match(/^\d+[.)]\s+(.+)$/)?.[1]?.trim() ?? null)
    .filter((item): item is string => Boolean(item));
  if (orderedItems.length >= 2 && orderedItems.length === lines.length) {
    return { type: "list", ordered: true, items: orderedItems };
  }

  const bulletItems = lines
    .map((line) => line.match(/^[-*]\s+(.+)$/)?.[1]?.trim() ?? null)
    .filter((item): item is string => Boolean(item));
  if (bulletItems.length >= 2 && bulletItems.length === lines.length) {
    return { type: "list", ordered: false, items: bulletItems };
  }

  return {
    type: "paragraph",
    text: lines.join("\n")
  };
}

function parseKeyValueLine(line: string): StructuredMessageField | null {
  const match = line.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
  if (!match) return null;
  const label = match[1]?.trim();
  const value = match[2]?.trim();
  if (!label || !value) return null;
  return { label, value };
}

function normalizeExecutionResponse(value: unknown): { blocks: StructuredMessageBlock[]; actions: StructuredMessageAction[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const direct = normalizeStructuredMessage(record);
  if (direct) {
    return {
      blocks: direct.blocks,
      actions: direct.actions ?? []
    };
  }

  if (Array.isArray(record.items)) {
    const items = record.items
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const itemRecord = item as Record<string, unknown>;
          const title = readString(itemRecord.title);
          const summary = readString(itemRecord.summary);
          const label = [title, summary].filter(Boolean).join(": ");
          return label || JSON.stringify(itemRecord);
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));

    if (items.length > 0) {
      return {
        blocks: [{ type: "list", ordered: true, items }],
        actions: normalizeStructuredActions(record.actions)
      };
    }
  }

  return null;
}

function blockToPlainText(block: StructuredMessageBlock): string {
  if (block.type === "paragraph") return block.text;
  if (block.type === "list") {
    return block.items
      .map((item, index) => (block.ordered ? `${index + 1}. ${item}` : `- ${item}`))
      .join("\n");
  }
  if (block.type === "key_value") {
    return block.items.map((item) => `${item.label}: ${item.value}`).join("\n");
  }
  return block.items
    .map((record) => {
      const header = record.title ? `${record.title}\n` : "";
      const fields = record.fields.map((field) => `${field.label}: ${field.value}`).join("\n");
      return `${header}${fields}`.trim();
    })
    .join("\n\n");
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
