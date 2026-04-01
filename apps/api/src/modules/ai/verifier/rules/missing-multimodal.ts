/**
 * Rule: missing_multimodal_evidence
 *
 * 客户发了图片/文件但回复完全没提及 —
 * 检查 chat history 中是否有多模态输入，以及最终回复是否有所回应。
 *
 * 插入点 B only: 只在最终回复生成后评估。
 */

import type { VerifierRule, PointBContext, RuleFinding } from "../types.js";

/** Keywords that suggest the answer acknowledged an image/file */
const MULTIMODAL_ACK_KEYWORDS = [
  "图片", "照片", "截图", "图中", "图上", "看到",
  "image", "photo", "screenshot", "picture", "attached",
  "gambar", "foto", "lampiran",
  "文件", "附件", "file", "document"
];

function chatContainsMultimodal(messages: Array<{ role: string; content: unknown }>): boolean {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    // Check for content parts array (multimodal messages use array format)
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === "object" && part !== null && "type" in part) {
          const p = part as { type: string };
          if (p.type === "image_url" || p.type === "image" || p.type === "file") {
            return true;
          }
        }
      }
    }
    // Check for text mentions of sending images
    const text = typeof msg.content === "string" ? msg.content : "";
    if (/\[image\]|\[图片\]|\[附件\]|\[file\]/.test(text)) {
      return true;
    }
  }
  return false;
}

function answerAcknowledgesMultimodal(finalContent: string): boolean {
  const lower = finalContent.toLowerCase();
  return MULTIMODAL_ACK_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export const missingMultimodalRule: VerifierRule = {
  id: "missing_multimodal_evidence",
  points: ["B"],

  evaluateB(ctx: PointBContext): RuleFinding {
    const hasMultimodal = chatContainsMultimodal(ctx.chatHistory) ||
                          chatContainsMultimodal(ctx.loopMessages);
    if (!hasMultimodal) {
      return {
        ruleId: "missing_multimodal_evidence",
        triggered: false,
        severity: "info",
        reason: "No multimodal input detected in conversation."
      };
    }

    const acknowledged = answerAcknowledgesMultimodal(ctx.finalContent);
    return {
      ruleId: "missing_multimodal_evidence",
      triggered: !acknowledged,
      severity: !acknowledged ? "warning" : "info",
      reason: !acknowledged
        ? "Customer sent image/file but the answer does not reference it."
        : "Answer acknowledges the multimodal input."
    };
  }
};
