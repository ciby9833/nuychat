import type { Knex } from "knex";

import { listTenantSkillsForPlanning } from "./skill-definition.service.js";

export type CapabilityRecommendationInput = {
  tenantId: string;
  conversationId: string;
  actorType: "ai" | "agent";
  moduleId?: string | null;
  preferredSkills?: string[];
};

export type CapabilityRecommendation = {
  skillName: string;
  installId: string;
  score: number;
  reasons: string[];
  preferred: boolean;
};

export async function recommendCapabilityScripts(
  db: Knex | Knex.Transaction,
  input: CapabilityRecommendationInput
): Promise<{
  availableSkillNames: string[];
  preferredSkillNames: string[];
  recommendations: CapabilityRecommendation[];
}> {
  const conversation = await db("conversations")
    .where({ tenant_id: input.tenantId, conversation_id: input.conversationId })
    .select("channel_type")
    .first<{ channel_type: string | null }>();

  const availableSkills = await listTenantSkillsForPlanning(db, {
    tenantId: input.tenantId,
    channelType: conversation?.channel_type ?? "",
    actorRole: input.actorType,
    moduleId: input.moduleId ?? null,
    ownerMode: input.actorType
  });

  const preferred = new Set(
    (input.preferredSkills ?? [])
      .map((item) => item.trim())
      .filter(Boolean)
  );

  const recommendations = availableSkills
    .flatMap((skill) =>
      skill.scripts
        .filter((script) => script.enabled)
        .map((script) => ({
          skillName: script.scriptKey,
          installId: skill.capabilityId,
          score: preferred.has(script.scriptKey) ? 100 : 10,
          reasons: preferred.has(script.scriptKey) ? ["preferred_in_conversation"] : ["available_in_scope"],
          preferred: preferred.has(script.scriptKey)
        }))
    )
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.skillName.localeCompare(right.skillName);
    });

  return {
    availableSkillNames: recommendations.map((item) => item.skillName),
    preferredSkillNames: recommendations.filter((item) => item.preferred).map((item) => item.skillName),
    recommendations: recommendations.slice(0, 8)
  };
}
