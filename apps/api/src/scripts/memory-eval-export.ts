import fs from "node:fs/promises";
import path from "node:path";

import { db, closeDatabase, withTenantTransaction } from "../infra/db/client.js";
import { getDatabaseSummary } from "../infra/db/config.js";

type MessageRow = {
  direction: string | null;
  sender_type: string | null;
  content: unknown;
  created_at: string;
};

type ConversationRow = {
  tenant_id: string;
  conversation_id: string;
  customer_id: string;
  case_id: string | null;
  summary: string | null;
  intent: string | null;
  sentiment: string | null;
  updated_at: string | null;
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
    tenantId: args.get("tenant") ?? "",
    limit: Number(args.get("limit") ?? "25"),
    out: args.get("out") ?? path.resolve(process.cwd(), "tmp/memory-eval-dataset.jsonl")
  };
}

function parseTextContent(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const text = (value as { text?: unknown }).text;
    return typeof text === "string" ? text.trim() : "";
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const text = (parsed as { text?: unknown }).text;
        return typeof text === "string" ? text.trim() : "";
      }
    } catch {
      return value.trim();
    }
  }
  return "";
}

async function main() {
  const { tenantId, limit, out } = parseArgs();
  if (!tenantId) {
    throw new Error("Missing required --tenant=<tenantId>");
  }

  const dataset = await withTenantTransaction(tenantId, async (trx) => {
    const conversations = await trx("conversation_memory_snapshots")
      .where({ tenant_id: tenantId })
      .select("tenant_id", "conversation_id", "customer_id", "case_id", "summary", "intent", "sentiment", "updated_at")
      .orderBy("updated_at", "desc")
      .limit(Math.max(1, Math.min(limit, 200))) as ConversationRow[];

    const rows = [];
    for (const conversation of conversations) {
      const [messages, existingMemories] = await Promise.all([
        trx("messages")
          .where({ tenant_id: tenantId, conversation_id: conversation.conversation_id })
          .select("direction", "sender_type", "content", "created_at")
          .orderBy("created_at", "asc")
          .limit(24) as Promise<MessageRow[]>,
        trx("customer_memory_units")
          .where({
            tenant_id: tenantId,
            customer_id: conversation.customer_id,
            conversation_id: conversation.conversation_id
          })
          .select("memory_type", "title", "summary", "detail", "source", "updated_at")
          .orderBy([{ column: "salience", order: "desc" }, { column: "updated_at", order: "desc" }])
          .limit(12)
      ]);

      rows.push({
        tenantId,
        customerId: conversation.customer_id,
        conversationId: conversation.conversation_id,
        caseId: conversation.case_id,
        conversationSummary: conversation.summary ?? "",
        lastIntent: conversation.intent ?? "general_inquiry",
        lastSentiment: conversation.sentiment ?? "neutral",
        messages: messages
          .map((message) => ({
            role: message.direction === "outbound" || message.sender_type === "workflow" ? "assistant" : "user",
            content: parseTextContent(message.content)
          }))
          .filter((message) => message.content),
        existingMemories: existingMemories.map((item) => ({
          type: String(item.memory_type ?? ""),
          title: String(item.title ?? ""),
          summary: String(item.summary ?? ""),
          detail: String(item.detail ?? ""),
          source: String(item.source ?? ""),
          updatedAt: String(item.updated_at ?? "")
        })),
        annotationGuide: {
          instructions: [
            "Fill goldActiveMemories with the durable memories that should exist after this conversation.",
            "Fill goldStaleMemories with memories that look plausible but should be considered stale / should not be kept.",
            "Use compact canonical summaries, one fact per item."
          ]
        },
        goldActiveMemories: [],
        goldStaleMemories: [],
        notes: ""
      });
    }
    return rows;
  });

  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${dataset.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    db: getDatabaseSummary(),
    tenantId,
    exported: dataset.length,
    out
  }, null, 2));
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
