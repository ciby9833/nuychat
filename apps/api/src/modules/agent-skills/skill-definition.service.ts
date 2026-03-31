import type { Knex } from "knex";

import type { SkillPlanningInput, TenantSkillDefinition } from "./contracts.js";

type CapabilityRow = {
  capability_id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
};

type CapabilityVersionRow = {
  version_id: string;
  capability_id: string;
  skill_md: string | null;
  forms_md: string | null;
  reference_md: string | null;
  input_schema_json: unknown;
  output_schema_json: unknown;
};

type CapabilityScriptRow = {
  script_id: string;
  version_id: string;
  script_key: string;
  name: string;
  file_name: string;
  language: string;
  source_code: string;
  requirements_json: unknown;
  env_refs_json: unknown;
  enabled: boolean;
};

function parseObject(value: unknown): Record<string, unknown> {
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

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function composeSkillPackageMarkdown(input: {
  skillMarkdown: string | null;
  formsMarkdown: string | null;
  referenceMarkdown: string | null;
}) {
  return [
    input.skillMarkdown?.trim() ? `# SKILL.md\n\n${input.skillMarkdown.trim()}` : null,
    input.formsMarkdown?.trim() ? `# FORMS.md\n\n${input.formsMarkdown.trim()}` : null,
    input.referenceMarkdown?.trim() ? `# REFERENCE.md\n\n${input.referenceMarkdown.trim()}` : null
  ].filter(Boolean).join("\n\n");
}

export async function listTenantSkillsForPlanning(
  db: Knex | Knex.Transaction,
  input: SkillPlanningInput
): Promise<TenantSkillDefinition[]> {
  const capabilityRows = await db("capabilities as c")
    .where("c.tenant_id", input.tenantId)
    .andWhere("c.status", "active")
    .andWhere(function availabilityClause() {
      this.whereExists(function matchedAvailabilityClause() {
        this.select(db.raw("1"))
          .from("capability_availability as av")
          .whereRaw("av.capability_id = c.capability_id")
          .andWhere("av.tenant_id", input.tenantId)
          .andWhere("av.enabled", true)
          .andWhere((qb) => {
            qb.whereNull("av.channel").orWhere("av.channel", input.channelType);
          })
          .andWhere((qb) => {
            qb.whereNull("av.role").orWhere("av.role", input.actorRole);
          })
          .andWhere((qb) => {
            if (input.moduleId) qb.whereNull("av.module_id").orWhere("av.module_id", input.moduleId);
            else qb.whereNull("av.module_id");
          })
          .andWhere((qb) => {
            if (input.ownerMode) qb.whereNull("av.owner_mode").orWhere("av.owner_mode", input.ownerMode);
            else qb.whereNull("av.owner_mode");
          });
      }).orWhereNotExists(function noAvailabilityRowsClause() {
        this.select(db.raw("1"))
          .from("capability_availability as av_any")
          .whereRaw("av_any.capability_id = c.capability_id")
          .andWhere("av_any.tenant_id", input.tenantId);
      });
    })
    .select("c.capability_id", "c.tenant_id", "c.code", "c.name", "c.description", "c.status");

  const capabilities = capabilityRows as CapabilityRow[];
  if (capabilities.length === 0) return [];

  const capabilityIds = capabilities.map((row) => row.capability_id);

  const versionRows = await db("capability_versions")
    .whereIn("capability_id", capabilityIds)
    .orderBy([{ column: "capability_id", order: "asc" }, { column: "version_no", order: "desc" }, { column: "created_at", order: "desc" }])
    .select("version_id", "capability_id", "skill_md", "forms_md", "reference_md", "input_schema_json", "output_schema_json");

  const latestCapabilityVersions = new Map<string, CapabilityVersionRow>();
  for (const row of versionRows as CapabilityVersionRow[]) {
    if (!latestCapabilityVersions.has(row.capability_id)) {
      latestCapabilityVersions.set(row.capability_id, row);
    }
  }

  const latestVersionIds = Array.from(new Set(
    Array.from(latestCapabilityVersions.values()).map((row) => row.version_id)
  ));
  const scriptRows = latestVersionIds.length > 0
    ? await db("capability_scripts")
        .whereIn("version_id", latestVersionIds)
        .andWhere("enabled", true)
        .orderBy([{ column: "version_id", order: "asc" }, { column: "created_at", order: "asc" }])
        .select("script_id", "version_id", "script_key", "name", "file_name", "language", "source_code", "requirements_json", "env_refs_json", "enabled")
    : [];
  const scriptIds = (scriptRows as CapabilityScriptRow[]).map((row) => row.script_id);
  const envRows = scriptIds.length > 0
    ? await db("capability_script_env_bindings")
        .whereIn("script_id", scriptIds)
        .orderBy([{ column: "script_id", order: "asc" }, { column: "created_at", order: "asc" }])
        .select("script_id", "env_key", "env_value")
    : [];
  const envByScriptId = new Map<string, Array<{ envKey: string; envValue: string }>>();
  for (const row of envRows as Array<{ script_id: string; env_key: string; env_value: string }>) {
    const current = envByScriptId.get(row.script_id) ?? [];
    current.push({ envKey: row.env_key, envValue: row.env_value });
    envByScriptId.set(row.script_id, current);
  }

  const grouped = new Map<string, TenantSkillDefinition>();
  for (const capability of capabilities) {
    const version = latestCapabilityVersions.get(capability.capability_id);
    grouped.set(capability.capability_id, {
      capabilityId: capability.capability_id,
      tenantId: capability.tenant_id,
      slug: capability.code,
      name: capability.name,
      description: capability.description,
      status: capability.status,
      triggerHints: {},
      inputSchema: parseObject(version?.input_schema_json),
      outputSchema: parseObject(version?.output_schema_json),
      policyConfig: {},
      executionStrategy: {},
      skillMarkdown: composeSkillPackageMarkdown({
        skillMarkdown: typeof version?.skill_md === "string" ? version.skill_md : null,
        formsMarkdown: typeof version?.forms_md === "string" ? version.forms_md : null,
        referenceMarkdown: typeof version?.reference_md === "string" ? version.reference_md : null
      }),
      formsMarkdown: typeof version?.forms_md === "string" ? version.forms_md : null,
      referenceMarkdown: typeof version?.reference_md === "string" ? version.reference_md : null,
      scripts: []
    });
  }

  const capabilityIdByVersionId = new Map<string, string>();
  for (const version of latestCapabilityVersions.values()) {
    capabilityIdByVersionId.set(version.version_id, version.capability_id);
  }

  for (const row of scriptRows as CapabilityScriptRow[]) {
    const capabilityId = capabilityIdByVersionId.get(row.version_id);
    if (!capabilityId) continue;
    const existing = grouped.get(capabilityId);
    if (!existing) continue;
    existing.scripts.push({
      scriptKey: row.script_key,
      name: row.name,
      fileName: row.file_name,
      language: row.language,
      sourceCode: row.source_code,
      requirements: parseStringArray(row.requirements_json),
      envRefs: parseStringArray(row.env_refs_json),
      envBindings: envByScriptId.get(row.script_id) ?? [],
      enabled: Boolean(row.enabled)
    });
  }

  return [...grouped.values()].filter((item) => item.scripts.length > 0);
}

export function buildSkillPlannerCatalog(skills: TenantSkillDefinition[]) {
  return skills.map((skill) => ({
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    triggerHints: skill.triggerHints,
    requiredInputs: Array.isArray(skill.inputSchema.required)
      ? skill.inputSchema.required.map((item) => String(item))
      : [],
    skillMarkdown: skill.skillMarkdown
  }));
}
