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
  const legacyHandoff = parseLegacyHandoff(raw);
  const action = normalizeAction(parsed.action, legacyHandoff ? "handoff" : fallback.defaultAction ?? "reply");
  const inferredIntent = inferConversationIntent(fallback.chatHistory);
  const inferredSentiment = inferConversationSentiment(fallback.chatHistory);
  const parsedIntent = normalizeIntent(parsed.intent);
  const parsedSentiment = normalizeSentiment(parsed.sentiment);
  const parsedResponse = asNonEmptyString(parsed.response);
  const legacyResponse = legacyHandoff ? null : asNonEmptyString(raw);
  const response = action === "reply" ? (parsedResponse ?? legacyResponse) : null;
  const handoffReason = action === "handoff"
    ? (asNonEmptyString(parsed.handoffReason) ?? legacyHandoff ?? "human_review_required")
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

export function inferConversationIntent(history: ChatMessage[]): string {
  const text = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase())
    .join(" ");

  if (/\b(order|pesanan|订单|注文|ord)\b/i.test(text)) return "order_inquiry";
  if (/\b(refund|返款|退款|pengembalian)\b/i.test(text)) return "refund_request";
  if (/\b(delivery|pengiriman|配送|配达|track|resi|awb)\b/i.test(text)) return "delivery_inquiry";
  if (/\b(cancel|batal|取消|キャンセル)\b/i.test(text)) return "cancellation";
  if (/\b(complaint|keluhan|投诉|クレーム|complain)\b/i.test(text)) return "complaint";
  if (/\b(payment|bayar|付款|支払|transfer)\b/i.test(text)) return "payment_inquiry";
  return "general_inquiry";
}

export function inferConversationSentiment(history: ChatMessage[]): AISentiment {
  const text = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase())
    .join(" ");

  const angryPhrases = [
    "marah", "kecewa", "jelek", "buruk", "complaint", "penipuan", "fraud",
    "退款", "投诉", "生气", "差评", "angry", "terrible", "worst", "scam",
    "tidak puas", "tidak beres", "bohong", "bohongin"
  ];
  if (angryPhrases.some((keyword) => text.includes(keyword))) return "angry";

  const negativePhrases = ["not happy", "bad", "late", "delay", "problem", "issue", "salah", "buruk"];
  if (negativePhrases.some((keyword) => text.includes(keyword))) return "negative";

  const positivePhrases = ["terima kasih", "thank", "thanks", "感谢", "ありがとう", "mantap", "bagus", "good"];
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

function parseLegacyHandoff(raw: string): string | null {
  if (!raw.startsWith("HANDOFF_REQUIRED:")) return null;
  return raw.replace("HANDOFF_REQUIRED:", "").trim() || "human_review_required";
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
