export type AIControlAction = "reply" | "handoff" | "defer";
export type AISentiment = "positive" | "neutral" | "negative" | "angry";

export type AIInteractionContract = {
  action: AIControlAction;
  response: string | null;
  handoffReason: string | null;
  intent: string;
  sentiment: AISentiment;
  confidence: number;
};

type ChatMessage = {
  role: string;
  content: string;
};

export const ORCHESTRATOR_RESPONSE_CONTRACT = `Return valid JSON only. Do not use markdown.

JSON shape:
{
  "action": "reply" | "handoff" | "defer",
  "response": "<customer-facing reply when action=reply, otherwise empty string>",
  "handoffReason": "<short operational reason when action=handoff, otherwise empty string>",
  "intent": "<short intent label>",
  "sentiment": "positive" | "neutral" | "negative" | "angry",
  "confidence": 0.0
}

Rules:
- The system, not you, controls routing and execution boundaries.
- Use "reply" when you can directly help the customer now.
- Use "handoff" when the customer explicitly wants a human, the situation needs human judgment, or the current system/tools are insufficient.
- Use "defer" when no customer-facing reply should be sent yet and no handoff is required.
- Keep "handoffReason" operational and concise.
- Always match the customer's language in "response".`;

export function normalizeAIInteractionContract(
  raw: string,
  fallback: {
    chatHistory: ChatMessage[];
    defaultAction?: AIControlAction;
  }
): AIInteractionContract {
  const parsed = safeParseJson(raw);
  const action = normalizeAction(parsed.action, fallback.defaultAction ?? "reply");
  const inferredIntent = inferConversationIntent(fallback.chatHistory);
  const inferredSentiment = inferConversationSentiment(fallback.chatHistory);
  const parsedIntent = normalizeIntent(parsed.intent);
  const parsedSentiment = normalizeSentiment(parsed.sentiment);
  const parsedResponse = asNonEmptyString(parsed.response);
  const response = action === "reply" ? parsedResponse : null;
  const handoffReason = action === "handoff"
    ? (asNonEmptyString(parsed.handoffReason) ?? "human_review_required")
    : null;
  const confidence = clampConfidence(parsed.confidence, action === "handoff" ? 0.9 : 0.75);
  const intent = action === "handoff"
    ? (parsedIntent ?? "handoff_request")
    : (parsedIntent ?? inferredIntent);
  const sentiment = parsedSentiment ?? inferredSentiment;

  if (action === "reply" && !response) {
    return {
      action: "defer",
      response: null,
      handoffReason: null,
      intent,
      sentiment,
      confidence: Math.min(confidence, 0.5)
    };
  }

  return {
    action,
    response,
    handoffReason,
    intent,
    sentiment,
    confidence
  };
}

/**
 * Fallback intent inference when LLM fails to return a valid intent.
 * Uses multilingual keyword heuristics — industry-agnostic categories.
 */
export function inferConversationIntent(history: ChatMessage[]): string {
  const text = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase())
    .join(" ");

  // Complaint / escalation (high priority — check first)
  if (/\b(complaint|keluhan|投诉|クレーム|complain|举报)\b/i.test(text)) return "complaint";
  // Cancellation
  if (/\b(cancel|batal|取消|キャンセル|撤销)\b/i.test(text)) return "cancellation";
  // Refund / return
  if (/\b(refund|返款|退款|退货|pengembalian|return)\b/i.test(text)) return "refund_request";
  // Status / tracking inquiry
  if (/\b(status|track|resi|awb|进度|状态|查询|pengiriman)\b/i.test(text)) return "status_inquiry";
  // Payment / billing
  if (/\b(payment|bayar|付款|支払|transfer|invoice|账单|发票)\b/i.test(text)) return "payment_inquiry";
  // Account / profile
  if (/\b(account|akun|账号|密码|password|login|register|注册)\b/i.test(text)) return "account_inquiry";
  // Appointment / booking
  if (/\b(appointment|booking|预约|预订|reservation|jadwal)\b/i.test(text)) return "booking_inquiry";
  return "general_inquiry";
}

export function inferConversationSentiment(history: ChatMessage[]): AISentiment {
  const text = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase())
    .join(" ");

  // Multilingual anger/escalation keywords (industry-agnostic)
  const angryPhrases = [
    "angry", "furious", "terrible", "worst", "scam", "fraud", "lawsuit", "lawyer", "sue",
    "生气", "愤怒", "投诉", "差评", "骗子", "举报", "曝光",
    "marah", "kecewa", "penipuan", "bohong", "tidak puas", "tidak beres"
  ];
  if (angryPhrases.some((keyword) => text.includes(keyword))) return "angry";

  const negativePhrases = [
    "not happy", "bad", "late", "delay", "problem", "issue", "wrong", "broken", "failed",
    "不满", "有问题", "出错", "太慢",
    "salah", "buruk", "lambat", "rusak"
  ];
  if (negativePhrases.some((keyword) => text.includes(keyword))) return "negative";

  const positivePhrases = [
    "thank", "thanks", "great", "excellent", "perfect", "awesome", "good",
    "感谢", "谢谢", "很好", "满意",
    "terima kasih", "mantap", "bagus", "ありがとう"
  ];
  if (positivePhrases.some((keyword) => text.includes(keyword))) return "positive";

  return "neutral";
}

export function isHumanHandoffIntent(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "handoff_request" || normalized === "human_handoff" || normalized === "human_escalation";
}

function normalizeAction(value: unknown, fallback: AIControlAction): AIControlAction {
  if (value === "reply" || value === "handoff" || value === "defer") return value;
  return fallback;
}

function normalizeIntent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, "_").toLowerCase();
  return normalized ? normalized.slice(0, 80) : null;
}

function normalizeSentiment(value: unknown): AISentiment | null {
  if (value === "positive" || value === "neutral" || value === "negative" || value === "angry") return value;
  return null;
}

function clampConfidence(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
