/**
 * 作用：消息语义分流，判断当前请求进入 knowledge / action / clarification 哪条轨道。
 * 上游：orchestrator.service.ts
 * 下游：context-pipeline.ts、prompt-assembler.ts、后续 skill-hydration.service.ts
 * 协作对象：ai-runtime-contract.ts（fallback intent）、fact-layer.service.ts（后续可接 recent facts）
 * 不负责：不直接执行 tool，不直接生成最终回复，不决定最终 handoff。
 * 变更注意：第一阶段使用规则路由止血；后续可替换为轻量模型分类器，但保持相同输出契约。
 */

import { inferConversationIntent } from "./ai-runtime-contract.js";
import type { SemanticRouteResult } from "./semantic-router.types.js";

const ACTION_KEYWORDS = [
  "status", "tracking", "track", "order", "ticket", "refund", "cancel", "invoice", "booking",
  "reservation", "appointment", "account", "password", "login", "shipment", "logistics",
  "状态", "进度", "查询", "订单", "单号", "退款", "取消", "账单", "发票", "预约", "账号", "密码", "物流"
];

const CLARIFICATION_PATTERNS = [
  "帮我查一下", "查一下", "看一下", "帮我看看", "处理一下",
  "check", "help me", "look into", "please help", "can you help",
  "tolong cek", "bantu cek"
];

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
  const fullUserText = userMessages.map((message) => message.content).join(" ").toLowerCase();
  const normalizedLast = lastUserMessage.toLowerCase();
  const intent = inferConversationIntent(input.chatHistory);

  if (shouldClarify(normalizedLast)) {
    return {
      track: "clarification_track",
      intent,
      confidence: 0.72,
      reason: "latest_user_message_is_too_generic_for_safe_execution"
    };
  }

  if (looksActionable(normalizedLast, fullUserText)) {
    return {
      track: "action_track",
      intent,
      confidence: 0.84,
      reason: "message_contains_transactional_lookup_or_execution_signals"
    };
  }

  return {
    track: "knowledge_track",
    intent,
    confidence: QUESTION_WORDS.some((word) => normalizedLast.includes(word)) ? 0.82 : 0.68,
    reason: "default_to_business_knowledge_answering_when_no_action_signal_detected"
  };
}

function shouldClarify(lastUserMessage: string): boolean {
  if (!lastUserMessage) return true;
  const compact = lastUserMessage.replace(/\s+/g, " ").trim();
  const hasReferenceLikeToken = /\b[A-Z0-9-]{6,24}\b/i.test(compact);
  const tooShort = compact.length <= 8;
  const genericOnly = CLARIFICATION_PATTERNS.some((pattern) => compact.includes(pattern));
  return !hasReferenceLikeToken && (tooShort || genericOnly);
}

function looksActionable(lastUserMessage: string, fullUserText: string): boolean {
  if (/\b[A-Z0-9-]{6,24}\b/i.test(lastUserMessage)) return true;
  return ACTION_KEYWORDS.some((keyword) => fullUserText.includes(keyword));
}
