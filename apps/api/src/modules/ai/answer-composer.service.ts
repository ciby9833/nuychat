/**
 * 作用：统一收口数字员工三条轨道的回复输出契约，避免 orchestrator 内部散落多处 return 分支。
 * 上游：orchestrator.service.ts
 * 下游：消息发送层、memory/archive 持久化、后续 answer contract 演进
 * 协作对象：ai-runtime-contract.ts、pre-reply-policy.service.ts、semantic-router.types.ts
 * 不负责：不做轨道判定，不执行 tool，不做知识检索与事实查询。
 * 变更注意：这里只消费已有决策结果并做轨道特化默认值，禁止在此重新发明编排逻辑。
 */

import type { AIInteractionContract, AISentiment, AIControlAction } from "./ai-runtime-contract.js";
import type { SemanticTrack } from "./semantic-router.types.js";
import type { OrchestratorResult } from "../orchestrator/orchestrator.service.js";

type BlockedSkill = { name: string; reason: string };

export interface ComposedAnswer {
  action: AIControlAction;
  responseText: string | null;
  responseSummary: string;
  handoffReason: string | null;
  result: OrchestratorResult;
}

export function composeClarificationTurn(input: {
  reply: string;
  confidence: number;
  skillsInvoked?: string[];
  skillsBlocked?: BlockedSkill[];
  tokensUsed?: number;
}): OrchestratorResult {
  return {
    action: "reply",
    response: input.reply.trim(),
    intent: "clarification_request",
    sentiment: "neutral",
    shouldHandoff: false,
    handoffReason: undefined,
    tokensUsed: input.tokensUsed ?? 0,
    confidence: input.confidence,
    skillsInvoked: input.skillsInvoked ?? [],
    skillsBlocked: input.skillsBlocked ?? []
  };
}

export function composeFinalAnswer(input: {
  track: SemanticTrack;
  aiDecision: AIInteractionContract;
  policyEnforcement: {
    action: AIControlAction;
    handoffReason: string | null;
  };
  finalContent: string;
  tokensUsed: number;
  skillsInvoked: string[];
  skillsBlocked: BlockedSkill[];
}): ComposedAnswer {
  const action = input.policyEnforcement.action;
  const handoffReason = action === "handoff"
    ? (input.policyEnforcement.handoffReason ?? "human_review_required")
    : null;
  const responseText = action === "reply"
    ? resolveTrackReply(input.track, input.aiDecision.response)
    : null;
  const intent = input.track === "clarification_track" && action === "reply"
    ? "clarification_request"
    : input.aiDecision.intent;
  const sentiment = input.track === "clarification_track" && action === "reply"
    ? "neutral"
    : input.aiDecision.sentiment;
  const responseSummary = responseText ?? handoffReason ?? input.finalContent.slice(0, 400);

  return {
    action,
    responseText,
    responseSummary,
    handoffReason,
    result: {
      action,
      response: responseText,
      intent,
      sentiment,
      shouldHandoff: action === "handoff",
      handoffReason: handoffReason ?? undefined,
      tokensUsed: input.tokensUsed,
      confidence: input.aiDecision.confidence,
      skillsInvoked: input.skillsInvoked,
      skillsBlocked: input.skillsBlocked
    }
  };
}

function resolveTrackReply(track: SemanticTrack, response: string | null): string | null {
  if (response?.trim()) return response.trim();
  if (track === "clarification_track") {
    return "Could you please provide more details so I can assist you?";
  }
  return null;
}
