import type { Knex } from "knex";

import { getBoundRuntimePolicies } from "./runtime-governance.service.js";

type ActorType = "ai" | "agent" | "workflow";

type RecommendInput = {
  tenantId: string;
  conversationId: string;
  actorType: ActorType;
  moduleId?: string | null;
  skillGroupId?: string | null;
  preferredSkills?: string[];
};

export type SkillRecommendation = {
  skillName: string;
  installId: string;
  score: number;
  reasons: string[];
  preferred: boolean;
};

export class SkillGatewayService {
  async recommend(
    db: Knex | Knex.Transaction,
    input: RecommendInput
  ): Promise<{ availableSkillNames: string[]; preferredSkillNames: string[]; recommendations: SkillRecommendation[] }> {
    const policy = await getBoundRuntimePolicies(db, {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      moduleId: input.moduleId,
      skillGroupId: input.skillGroupId,
      actorType: input.actorType
    });

    const available = Array.from(policy.values());
    if (available.length === 0) {
      return { availableSkillNames: [], preferredSkillNames: [], recommendations: [] };
    }

    const context = await loadConversationContext(db, input.tenantId, input.conversationId);
    const preferred = normalizeSkillNames(input.preferredSkills ?? []);
    const recommendationRows: SkillRecommendation[] = available.map((item) => {
      const scoreData = scoreSkill(item.skillName, context);
      if (preferred.includes(item.skillName)) {
        scoreData.score += 30;
        scoreData.reasons.push("preferred_in_conversation");
      }
      return {
        skillName: item.skillName,
        installId: item.installId,
        score: scoreData.score,
        reasons: scoreData.reasons,
        preferred: preferred.includes(item.skillName)
      };
    });

    recommendationRows.sort((a, b) => b.score - a.score);

    return {
      availableSkillNames: available.map((item) => item.skillName),
      preferredSkillNames: preferred.filter((name) => available.some((row) => row.skillName === name)),
      recommendations: recommendationRows.slice(0, 8)
    };
  }
}

type ConversationContext = {
  text: string;
  customerTier: string;
  hasOrderId: boolean;
  hasTrackingNumber: boolean;
};

async function loadConversationContext(
  db: Knex | Knex.Transaction,
  tenantId: string,
  conversationId: string
): Promise<ConversationContext> {
  const [conversation, recentMessages] = await Promise.all([
    db("conversations as c")
      .join("customers as cu", "cu.customer_id", "c.customer_id")
      .where({ "c.tenant_id": tenantId, "c.conversation_id": conversationId })
      .select("cu.tier as customer_tier", "c.last_message_preview")
      .first<{ customer_tier: string | null; last_message_preview: string | null }>(),
    db("messages")
      .where({ tenant_id: tenantId, conversation_id: conversationId })
      .select("content")
      .orderBy("created_at", "desc")
      .limit(10)
  ]);

  const texts = [
    conversation?.last_message_preview ?? "",
    ...recentMessages.map((row) => extractText(row.content))
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    text: texts,
    customerTier: String(conversation?.customer_tier ?? "standard").toLowerCase(),
    hasOrderId: /\b(ord|order|#)[a-z0-9\-]{4,}\b/i.test(texts),
    hasTrackingNumber: /\b(awb|tracking|resi|waybill)\b/i.test(texts)
  };
}

function scoreSkill(skillName: string, ctx: ConversationContext): { score: number; reasons: string[] } {
  let score = 10;
  const reasons: string[] = ["installed_and_enabled"];

  if (skillName === "lookup_order") {
    if (containsAny(ctx.text, ["order", "订单", "pesanan", "purchase", "invoice"])) {
      score += 40;
      reasons.push("order_intent");
    }
    if (ctx.hasOrderId) {
      score += 25;
      reasons.push("order_id_detected");
    }
  }

  if (skillName === "track_shipment") {
    if (containsAny(ctx.text, ["shipping", "shipment", "logistics", "delivery", "物流", "快递", "resi"])) {
      score += 40;
      reasons.push("shipment_intent");
    }
    if (ctx.hasTrackingNumber) {
      score += 25;
      reasons.push("tracking_reference_detected");
    }
  }

  if (skillName === "search_knowledge_base") {
    if (containsAny(ctx.text, ["policy", "return", "refund", "faq", "规则", "退货", "退款"])) {
      score += 35;
      reasons.push("policy_or_faq_intent");
    }
  }

  if (skillName === "get_customer_info") {
    if (containsAny(ctx.text, ["vip", "history", "profile", "标签", "客户信息", "customer"])) {
      score += 25;
      reasons.push("customer_profile_intent");
    }
    if (ctx.customerTier === "vip" || ctx.customerTier === "premium") {
      score += 20;
      reasons.push("high_tier_customer");
    }
  }

  return { score, reasons };
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function normalizeSkillNames(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}

function extractText(content: unknown): string {
  if (content && typeof content === "object") {
    const value = (content as { text?: unknown }).text;
    return typeof value === "string" ? value : "";
  }
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === "object") {
        const value = (parsed as { text?: unknown }).text;
        return typeof value === "string" ? value : "";
      }
    } catch {
      return "";
    }
  }
  return "";
}
