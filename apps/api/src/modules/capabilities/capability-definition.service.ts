import { withTenantTransaction } from "../../infra/db/client.js";
import { parseJsonObject, toIsoString } from "../tenant/tenant-admin.shared.js";

export type CapabilityUpsertInput = {
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status?: string | null;
  skillMarkdown?: string | null;
  formsMarkdown?: string | null;
  referenceMarkdown?: string | null;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  scripts?: Array<{
    scriptKey: string;
    name: string;
    fileName?: string | null;
    language?: string | null;
    sourceCode: string;
    requirements?: string[];
    envBindings?: Array<{
      envKey: string;
      envValue: string;
    }>;
    enabled?: boolean;
  }>;
};

export async function listCapabilitiesForTenant(tenantId: string) {
  return withTenantTransaction(tenantId, async (trx) => {
    const rows = await trx("capabilities")
      .where({ tenant_id: tenantId })
      .select("*")
      .orderBy([{ column: "updated_at", order: "desc" }, { column: "created_at", order: "desc" }]);

    return rows.map((row) => ({
      capabilityId: row.capability_id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      category: row.category,
      status: row.status,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at)
    }));
  });
}

export async function getCapabilityDetailForTenant(tenantId: string, capabilityId: string) {
  return withTenantTransaction(tenantId, async (trx) => {
    return readCapabilityDetail(trx, tenantId, capabilityId);
  });
}

export async function createCapabilityForTenant(tenantId: string, input: CapabilityUpsertInput) {
  return withTenantTransaction(tenantId, async (trx) => {
    const [capabilityRow] = await trx("capabilities")
      .insert({
        tenant_id: tenantId,
        code: input.code.trim(),
        name: input.name.trim(),
        description: typeof input.description === "string" ? input.description.trim() || null : null,
        category: typeof input.category === "string" && input.category.trim() ? input.category.trim() : "general",
        status: typeof input.status === "string" && input.status.trim() ? input.status.trim() : "active"
      })
      .returning(["capability_id"]);

    const [versionRow] = await trx("capability_versions")
      .insert({
        capability_id: capabilityRow.capability_id,
        version_no: 1,
        metadata_yaml: buildMetadataYaml({
          code: input.code.trim(),
          name: input.name.trim(),
          description: typeof input.description === "string" ? input.description.trim() || null : null
        }),
        skill_md: typeof input.skillMarkdown === "string" ? input.skillMarkdown : "",
        forms_md: typeof input.formsMarkdown === "string" ? input.formsMarkdown : "",
        reference_md: typeof input.referenceMarkdown === "string" ? input.referenceMarkdown : "",
        input_schema_json: input.inputSchema ?? {},
        output_schema_json: input.outputSchema ?? {},
        change_log: "Created from capability admin"
      })
      .returning(["version_id"]);

    const scripts = normalizeScripts(input.scripts);
    if (scripts.length > 0) {
      const insertedScripts = await trx("capability_scripts").insert(
        scripts.map((item) => ({
          version_id: versionRow.version_id,
          script_key: item.scriptKey,
          name: item.name,
          file_name: item.fileName,
          language: item.language,
          source_code: item.sourceCode,
          requirements_json: JSON.stringify(item.requirements),
          env_refs_json: JSON.stringify(item.envBindings.map((entry: any) => entry.envKey)),
          enabled: item.enabled
        }))
      ).returning(["script_id", "script_key"]);

      const scriptIdByKey = new Map(insertedScripts.map((item: any) => [String(item.script_key), String(item.script_id)]));
      const envRows = scripts.flatMap((item) => {
        const scriptId = scriptIdByKey.get(item.scriptKey);
        if (!scriptId) return [];
        return item.envBindings.map((entry: any) => ({
          script_id: scriptId,
          env_key: entry.envKey,
          env_value: entry.envValue
        }));
      });
      if (envRows.length > 0) {
        await trx("capability_script_env_bindings").insert(envRows);
      }
    }

    // Default new capabilities to AI-available globally unless narrowed later.
    await trx("capability_availability").insert({
      tenant_id: tenantId,
      capability_id: capabilityRow.capability_id,
      channel: null,
      role: null,
      module_id: null,
      owner_mode: null,
      enabled: true
    });

    return readCapabilityDetail(trx, tenantId, capabilityRow.capability_id);
  });
}

export async function updateCapabilityForTenant(tenantId: string, capabilityId: string, input: Partial<CapabilityUpsertInput>) {
  return withTenantTransaction(tenantId, async (trx) => {
    const existing = await trx("capabilities")
      .where({ tenant_id: tenantId, capability_id: capabilityId })
      .first();
    if (!existing) return null;

    const nextCode = typeof input.code === "string" && input.code.trim() ? input.code.trim() : existing.code;
    const nextName = typeof input.name === "string" && input.name.trim() ? input.name.trim() : existing.name;
    const nextDescription = input.description !== undefined
      ? (typeof input.description === "string" ? input.description.trim() || null : null)
      : (existing.description ?? null);
    const nextCategory = input.category !== undefined
      ? (typeof input.category === "string" && input.category.trim() ? input.category.trim() : "general")
      : existing.category;
    const nextStatus = input.status !== undefined
      ? (typeof input.status === "string" && input.status.trim() ? input.status.trim() : "active")
      : existing.status;

    await trx("capabilities")
      .where({ tenant_id: tenantId, capability_id: capabilityId })
      .update({
        code: nextCode,
        name: nextName,
        description: nextDescription,
        category: nextCategory,
        status: nextStatus
      });

    const latestVersion = await trx("capability_versions")
      .where({ capability_id: capabilityId })
      .orderBy([{ column: "version_no", order: "desc" }, { column: "created_at", order: "desc" }])
      .first();

    const nextVersionNo = Number(latestVersion?.version_no ?? 0) + 1;
    const [versionRow] = await trx("capability_versions")
      .insert({
        capability_id: capabilityId,
        version_no: nextVersionNo,
        metadata_yaml: buildMetadataYaml({
          code: nextCode,
          name: nextName,
          description: nextDescription
        }),
        skill_md: typeof input.skillMarkdown === "string"
          ? input.skillMarkdown
          : (typeof latestVersion?.skill_md === "string" ? latestVersion.skill_md : ""),
        forms_md: typeof input.formsMarkdown === "string"
          ? input.formsMarkdown
          : (typeof latestVersion?.forms_md === "string" ? latestVersion.forms_md : ""),
        reference_md: typeof input.referenceMarkdown === "string"
          ? input.referenceMarkdown
          : (typeof latestVersion?.reference_md === "string" ? latestVersion.reference_md : ""),
        input_schema_json: input.inputSchema ?? parseJsonObject(latestVersion?.input_schema_json),
        output_schema_json: input.outputSchema ?? parseJsonObject(latestVersion?.output_schema_json),
        change_log: "Updated from capability admin"
      })
      .returning(["version_id"]);

    const scripts = input.scripts !== undefined
      ? normalizeScripts(input.scripts)
      : await trx("capability_scripts")
          .where({ version_id: latestVersion?.version_id ?? "" })
          .select("script_key", "name", "file_name", "language", "source_code", "requirements_json", "env_refs_json", "enabled")
          .then((rows) => rows.map((row) => ({
            scriptKey: row.script_key,
            name: row.name,
            fileName: row.file_name,
            language: row.language,
            sourceCode: row.source_code,
            requirements: Array.isArray(row.requirements_json) ? row.requirements_json.map(String) : [],
            envBindings: Array.isArray(row.env_refs_json)
              ? row.env_refs_json.map((entry: unknown) => ({
                  envKey: String(entry),
                  envValue: ""
                }))
              : [],
            enabled: Boolean(row.enabled)
          })));

    if (scripts.length > 0) {
      const insertedScripts = await trx("capability_scripts").insert(
        scripts.map((item) => ({
          version_id: versionRow.version_id,
          script_key: item.scriptKey,
          name: item.name,
          file_name: item.fileName,
          language: item.language,
          source_code: item.sourceCode,
          requirements_json: JSON.stringify(item.requirements),
          env_refs_json: JSON.stringify(item.envBindings.map((entry: any) => entry.envKey)),
          enabled: item.enabled
        }))
      ).returning(["script_id", "script_key"]);

      const scriptIdByKey = new Map(insertedScripts.map((item: any) => [String(item.script_key), String(item.script_id)]));
      const envRows = scripts.flatMap((item) => {
        const scriptId = scriptIdByKey.get(item.scriptKey);
        if (!scriptId) return [];
        return item.envBindings.map((entry: any) => ({
          script_id: scriptId,
          env_key: entry.envKey,
          env_value: entry.envValue
        }));
      });
      if (envRows.length > 0) {
        await trx("capability_script_env_bindings").insert(envRows);
      }
    }

    return readCapabilityDetail(trx, tenantId, capabilityId);
  });
}

export async function deleteCapabilityForTenant(tenantId: string, capabilityId: string) {
  return withTenantTransaction(tenantId, async (trx) => {
    const deleted = await trx("capabilities")
      .where({ tenant_id: tenantId, capability_id: capabilityId })
      .delete();
    return deleted > 0;
  });
}

function normalizeScripts(
  scripts: CapabilityUpsertInput["scripts"] | undefined
): Array<{
  scriptKey: string;
  name: string;
  fileName: string;
  language: string;
  sourceCode: string;
  requirements: string[];
  envBindings: Array<{
    envKey: string;
    envValue: string;
  }>;
  enabled: boolean;
}> {
  if (!Array.isArray(scripts)) return [];
  return scripts
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      scriptKey: typeof item.scriptKey === "string" ? item.scriptKey.trim() : "",
      name: typeof item.name === "string" ? item.name.trim() : "",
      fileName: typeof item.fileName === "string" && item.fileName.trim()
        ? item.fileName.trim()
        : `${typeof item.scriptKey === "string" && item.scriptKey.trim() ? item.scriptKey.trim() : "script"}.py`,
      language: typeof item.language === "string" && item.language.trim() ? item.language.trim() : "python",
      sourceCode: typeof item.sourceCode === "string" ? item.sourceCode : "",
      requirements: Array.isArray(item.requirements)
        ? item.requirements.map((entry) => String(entry).trim()).filter(Boolean)
        : [],
      envBindings: Array.isArray(item.envBindings)
        ? item.envBindings
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              envKey: typeof entry.envKey === "string" ? entry.envKey.trim() : "",
              envValue: typeof entry.envValue === "string" ? entry.envValue : ""
            }))
            .filter((entry) => entry.envKey)
        : [],
      enabled: item.enabled !== false
    }))
    .filter((item) => item.scriptKey && item.name);
}

async function readCapabilityDetail(trx: any, tenantId: string, capabilityId: string) {
  const row = await trx("capabilities").where({ tenant_id: tenantId, capability_id: capabilityId }).first();
  if (!row) return null;

  const version = await trx("capability_versions")
    .where({ capability_id: capabilityId })
    .orderBy([{ column: "version_no", order: "desc" }, { column: "created_at", order: "desc" }])
    .first();

  const scriptRows = version
    ? await trx("capability_scripts")
        .where({ version_id: version.version_id })
        .orderBy("created_at", "asc")
    : [];
  const scriptIds = scriptRows.map((item: any) => item.script_id);
  const envRows = scriptIds.length > 0
    ? await trx("capability_script_env_bindings")
        .whereIn("script_id", scriptIds)
        .orderBy("created_at", "asc")
    : [];
  const envByScriptId = new Map<string, Array<{ envKey: string; envValue: string }>>();
  for (const row of envRows as any[]) {
    const current = envByScriptId.get(String(row.script_id)) ?? [];
    current.push({
      envKey: String(row.env_key),
      envValue: typeof row.env_value === "string" ? row.env_value : ""
    });
    envByScriptId.set(String(row.script_id), current);
  }

  return {
    capabilityId: row.capability_id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    category: row.category,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    metadata: parseJsonObject(version?.metadata_yaml ? {} : {}),
    metadataYaml: typeof version?.metadata_yaml === "string" ? version.metadata_yaml : "",
    skillMarkdown: typeof version?.skill_md === "string" ? version.skill_md : "",
    formsMarkdown: typeof version?.forms_md === "string" ? version.forms_md : "",
    referenceMarkdown: typeof version?.reference_md === "string" ? version.reference_md : "",
    inputSchema: parseJsonObject(version?.input_schema_json),
    outputSchema: parseJsonObject(version?.output_schema_json),
    scripts: scriptRows.map((item: any) => ({
      scriptId: item.script_id,
      scriptKey: item.script_key,
      name: item.name,
      fileName: item.file_name,
      language: item.language,
      sourceCode: typeof item.source_code === "string" ? item.source_code : "",
      requirements: Array.isArray(item.requirements_json) ? item.requirements_json.map(String) : [],
      envRefs: Array.isArray(item.env_refs_json) ? item.env_refs_json.map(String) : [],
      envBindings: envByScriptId.get(String(item.script_id)) ?? [],
      enabled: Boolean(item.enabled)
    }))
  };
}

function buildMetadataYaml(input: { code: string; name: string; description?: string | null }) {
  return [
    `code: ${input.code}`,
    `name: ${input.name}`,
    `description: ${input.description ?? ""}`
  ].join("\n");
}
