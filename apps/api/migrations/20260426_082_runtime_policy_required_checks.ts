import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const rows = await knex("tenant_ai_runtime_policies")
    .select("policy_id", "pre_reply_policies")
    .whereNotNull("pre_reply_policies");

  for (const row of rows) {
    const parsed = parsePolicy(row.pre_reply_policies);
    const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
    const nextRules = rules.map((rule) => {
      const current = parseRecord(rule);
      const next = {
        ...current,
        requiredChecks: Array.isArray(current.requiredSkills)
          ? current.requiredSkills.map(mapLegacySkillToCheck).filter(Boolean)
          : Array.isArray(current.requiredChecks)
            ? current.requiredChecks
            : [],
        augmentPreferredChecks: current.augmentPreferredChecks ?? current.augmentPreferredSkills ?? true
      };
      delete (next as Record<string, unknown>).requiredSkills;
      delete (next as Record<string, unknown>).augmentPreferredSkills;
      return next;
    });

    await knex("tenant_ai_runtime_policies")
      .where({ policy_id: row.policy_id })
      .update({
        pre_reply_policies: JSON.stringify({ ...parsed, rules: nextRules }),
        updated_at: knex.fn.now()
      });
  }
}

export async function down(knex: Knex): Promise<void> {
  const rows = await knex("tenant_ai_runtime_policies")
    .select("policy_id", "pre_reply_policies")
    .whereNotNull("pre_reply_policies");

  for (const row of rows) {
    const parsed = parsePolicy(row.pre_reply_policies);
    const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
    const nextRules = rules.map((rule) => {
      const current = parseRecord(rule);
      const next = {
        ...current,
        requiredSkills: Array.isArray(current.requiredChecks)
          ? current.requiredChecks.map(mapCheckToLegacySkill).filter(Boolean)
          : [],
        augmentPreferredSkills: current.augmentPreferredChecks ?? true
      };
      delete (next as Record<string, unknown>).requiredChecks;
      delete (next as Record<string, unknown>).augmentPreferredChecks;
      return next;
    });

    await knex("tenant_ai_runtime_policies")
      .where({ policy_id: row.policy_id })
      .update({
        pre_reply_policies: JSON.stringify({ ...parsed, rules: nextRules }),
        updated_at: knex.fn.now()
      });
  }
}

function parsePolicy(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapLegacySkillToCheck(value: unknown) {
  if (value === "search_knowledge_base") return "knowledge_lookup";
  if (value === "lookup_order") return "order_lookup";
  if (value === "track_shipment") return "shipment_tracking";
  return null;
}

function mapCheckToLegacySkill(value: unknown) {
  if (value === "knowledge_lookup") return "search_knowledge_base";
  if (value === "order_lookup") return "lookup_order";
  if (value === "shipment_tracking") return "track_shipment";
  return null;
}
