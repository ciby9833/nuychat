/**
 * 作用：消息语义分流，输出 analytics 标签供内存编码和监控使用。
 * 上游：orchestrator.service.ts
 * 下游：orchestrator 内存写入（semanticTrack 字段）
 * 协作对象：ai-runtime-contract.ts（fallback intent）
 * 不负责：不直接执行 tool，不生成最终回复，不决定 handoff，不限制工具访问。
 * 变更注意：track 已从执行门控降级为纯分析标签；后续可替换为轻量模型分类器，保持相同输出契约。
 */

import { inferConversationIntent } from "./ai-runtime-contract.js";
import type { SemanticRouteResult } from "./semantic-router.types.js";

const QUESTION_WORDS = [
  "what", "why", "how", "which", "when", "where", "can", "does",
  "什么", "为什么", "怎么", "如何", "哪个", "哪种", "是否", "可以",
  "apa", "bagaimana", "kenapa", "mengapa", "bisakah"
];

export async function routeMessage(input: {
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<SemanticRouteResult> {
  const userMessages = input.chatHistory.filter((message) => message.role === "user");
  const lastUserMessage = userMessages.at(-1)?.content.trim() ?? "";
  const normalizedLast = lastUserMessage.toLowerCase();
  const intent = inferConversationIntent(input.chatHistory);

  // Very short or empty messages — logged as clarification for analytics
  if (normalizedLast.length <= 5) {
    return {
      track: "clarification_track",
      intent,
      confidence: 0.70,
      reason: "latest_user_message_too_short_to_classify"
    };
  }

  // Reference-like token (IDs, codes) — likely actionable
  if (/\b[A-Z0-9-]{6,24}\b/i.test(lastUserMessage)) {
    return {
      track: "action_track",
      intent,
      confidence: 0.84,
      reason: "message_contains_reference_like_token"
    };
  }

  return {
    track: "knowledge_track",
    intent,
    confidence: QUESTION_WORDS.some((word) => normalizedLast.includes(word)) ? 0.82 : 0.68,
    reason: "default_to_knowledge_answering"
  };
}
