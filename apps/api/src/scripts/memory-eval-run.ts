import fs from "node:fs/promises";
import path from "node:path";

import { db, closeDatabase, withTenantTransaction } from "../infra/db/client.js";
import { getDatabaseSummary } from "../infra/db/config.js";
import { previewConversationMemories } from "../modules/memory/memory-encoder.service.js";

type DatasetMemory = {
  type: string;
  title?: string;
  summary: string;
  detail?: string;
};

type DatasetRow = {
  tenantId: string;
  customerId: string;
  conversationId: string;
  caseId?: string | null;
  conversationSummary: string;
  lastIntent: string;
  lastSentiment: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  goldActiveMemories: DatasetMemory[];
  goldStaleMemories?: DatasetMemory[];
  notes?: string;
};

type PredictedMemory = {
  type: string;
  title: string;
  summary: string;
};

function parseArgs() {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("--")) continue;
    const [key, ...rest] = trimmed.slice(2).split("=");
    args.set(key, rest.join("="));
  }
  return {
    file: args.get("file") ?? path.resolve(process.cwd(), "tmp/memory-eval-dataset.jsonl"),
    out: args.get("out") ?? path.resolve(process.cwd(), "tmp/memory-eval-report.json")
  };
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function memoryKey(item: { type: string; summary: string }) {
  return `${normalize(item.type)}|${normalize(item.summary)}`;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function loadDataset(file: string) {
  const raw = await fs.readFile(file, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DatasetRow);
}

async function main() {
  const { file, out } = parseArgs();
  const dataset = await loadDataset(file);
  if (dataset.length === 0) {
    throw new Error(`Dataset is empty: ${file}`);
  }

  const perConversation = [];
  let totalPredicted = 0;
  let totalMatchedActive = 0;
  let totalDuplicates = 0;
  let totalPredictedAgainstStale = 0;

  for (const sample of dataset) {
    const evaluation = await withTenantTransaction(sample.tenantId, async () => {
      const preview = await previewConversationMemories(db, {
        tenantId: sample.tenantId,
        customerId: sample.customerId,
        conversationId: sample.conversationId,
        caseId: sample.caseId ?? null,
        messages: sample.messages,
        conversationSummary: sample.conversationSummary,
        lastIntent: sample.lastIntent,
        lastSentiment: sample.lastSentiment,
        persist: false
      });
      return preview;
    });

    const predicted: PredictedMemory[] = evaluation.skipped
      ? []
      : (evaluation as unknown as { finalItems: Array<{ type: string; title: string; summary: string }> }).finalItems.map((item) => ({
          type: item.type,
          title: item.title,
          summary: item.summary
        }));

    const predictedKeys = predicted.map(memoryKey);
    const activeKeys = new Set(safeArray<DatasetMemory>(sample.goldActiveMemories).map(memoryKey));
    const staleKeys = new Set(safeArray<DatasetMemory>(sample.goldStaleMemories).map(memoryKey));
    const uniquePredictedKeys = new Set(predictedKeys);
    const matchedActive = predictedKeys.filter((key: string) => activeKeys.has(key)).length;
    const duplicateCount = predictedKeys.length - uniquePredictedKeys.size;
    const staleMatches = predictedKeys.filter((key: string) => staleKeys.has(key)).length;

    totalPredicted += predictedKeys.length;
    totalMatchedActive += matchedActive;
    totalDuplicates += duplicateCount;
    totalPredictedAgainstStale += staleMatches;

    perConversation.push({
      tenantId: sample.tenantId,
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

  const report = {
    ok: true,
    db: getDatabaseSummary(),
    file,
    conversations: dataset.length,
    totals: {
      predicted: totalPredicted,
      matchedActive: totalMatchedActive,
      duplicates: totalDuplicates,
      staleMatches: totalPredictedAgainstStale
    },
    metrics: {
      precision: totalPredicted > 0 ? totalMatchedActive / totalPredicted : 0,
      duplicateRate: totalPredicted > 0 ? totalDuplicates / totalPredicted : 0,
      staleMemoryRate: totalPredicted > 0 ? totalPredictedAgainstStale / totalPredicted : 0
    },
    perConversation
  };

  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      db: getDatabaseSummary(),
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
