/**
 * 作用：定义数字员工第一阶段的语义分流结果类型。
 * 上游：semantic-router.service.ts、orchestrator.service.ts
 * 下游：context-pipeline.ts、prompt-assembler.ts、后续 skill-hydration.service.ts
 * 协作对象：ai-runtime-contract.ts（fallback intent 推断）
 * 不负责：不执行 tool，不生成最终回复，不做权限判定。
 * 变更注意：如后续引入模型分类器，优先扩展字段，不要破坏 track 枚举。
 */

export type SemanticTrack = "knowledge_track" | "action_track" | "clarification_track";

export interface SemanticRouteResult {
  track: SemanticTrack;
  intent: string;
  confidence: number;
  reason: string;
}
