import type { Knex } from "knex";

import { previewConversationMemories } from "./memory-encoder.service.js";

export type MemoryEvalDatasetRow = {
  tenantId: string;
  customerId: string;
  conversationId: string;
  caseId?: string | null;
  conversationSummary: string;
  lastIntent: string;
  lastSentiment: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  goldActiveMemories: Array<{ type: string; title?: string; summary: string; detail?: string }>;
  goldStaleMemories?: Array<{ type: string; title?: string; summary: string; detail?: string }>;
  notes?: string;
};

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function memoryKey(item: { type: string; summary: string }) {
  return `${normalize(item.type)}|${normalize(item.summary)}`;
}

export async function runMemoryEvaluation(
  db: Knex,
  tenantId: string,
  dataset: MemoryEvalDatasetRow[]
) {
  const perConversation = [];
  let totalPredicted = 0;
  let totalMatchedActive = 0;
  let totalDuplicates = 0;
  let totalStaleMatches = 0;

  for (const sample of dataset) {
    const evaluation = await previewConversationMemories(db, {
      tenantId,
      customerId: sample.customerId,
      conversationId: sample.conversationId,
      caseId: sample.caseId ?? null,
      messages: sample.messages,
      conversationSummary: sample.conversationSummary,
      lastIntent: sample.lastIntent,
      lastSentiment: sample.lastSentiment,
      persist: false
    });

    const predicted = evaluation.skipped
      ? []
      : (evaluation as { finalItems: Array<{ type: string; title: string; summary: string }> }).finalItems.map((item) => ({
          type: item.type,
          title: item.title,
          summary: item.summary
        }));

    const predictedKeys = predicted.map(memoryKey);
    const activeKeys = new Set((sample.goldActiveMemories ?? []).map(memoryKey));
    const staleKeys = new Set((sample.goldStaleMemories ?? []).map(memoryKey));
    const uniquePredictedKeys = new Set(predictedKeys);
    const matchedActive = predictedKeys.filter((key) => activeKeys.has(key)).length;
    const duplicateCount = predictedKeys.length - uniquePredictedKeys.size;
    const staleMatches = predictedKeys.filter((key) => staleKeys.has(key)).length;

    totalPredicted += predictedKeys.length;
    totalMatchedActive += matchedActive;
    totalDuplicates += duplicateCount;
    totalStaleMatches += staleMatches;

    perConversation.push({
      tenantId,
      conversationId: sample.conversationId,
      customerId: sample.customerId,
      skipped: evaluation.skipped,
      skipReason: evaluation.skipped ? evaluation.reason : null,
      predictedCount: predictedKeys.length,
      goldActiveCount: activeKeys.size,
      goldStaleCount: staleKeys.size,
      matchedActive,
      duplicateCount,
      staleMatches,
      precision: predictedKeys.length > 0 ? matchedActive / predictedKeys.length : 0,
      duplicateRate: predictedKeys.length > 0 ? duplicateCount / predictedKeys.length : 0,
      staleMemoryRate: predictedKeys.length > 0 ? staleMatches / predictedKeys.length : 0,
      predicted
    });
  }

  return {
    conversations: dataset.length,
    totals: {
      predicted: totalPredicted,
      matchedActive: totalMatchedActive,
      duplicates: totalDuplicates,
      staleMatches: totalStaleMatches
    },
    metrics: {
      precision: totalPredicted > 0 ? totalMatchedActive / totalPredicted : 0,
      duplicateRate: totalPredicted > 0 ? totalDuplicates / totalPredicted : 0,
      staleMemoryRate: totalPredicted > 0 ? totalStaleMatches / totalPredicted : 0
    },
    perConversation
  };
}
