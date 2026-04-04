import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import { toIsoString } from "../tenant/tenant-admin.shared.js";
import { DEFAULT_GUIDELINE } from "./qa-v2.shared.js";
import type { QaGuidelineView } from "./qa-v2.types.js";

export async function getActiveQaGuideline(tenantId: string) {
  return withTenantTransaction(tenantId, async (trx) => ensureActiveQaGuideline(trx, tenantId));
}

export async function upsertActiveQaGuideline(
  tenantId: string,
  input: {
    name?: string | null;
    contentMd: string;
  }
) {
  return withTenantTransaction(tenantId, async (trx) => {
    const current = await trx("qa_guidelines")
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy("updated_at", "desc")
      .first<{ guideline_id: string; version: number } | undefined>();

    if (current) {
      const [row] = await trx("qa_guidelines")
        .where({ tenant_id: tenantId, guideline_id: current.guideline_id })
        .update({
          name: input.name?.trim() || "默认QA准则",
          content_md: input.contentMd.trim(),
          version: current.version + 1,
          updated_at: trx.fn.now()
        })
        .returning(["guideline_id", "name", "content_md", "version", "is_active", "created_at", "updated_at"]);
      return serializeQaGuideline(row);
    }

    const [row] = await trx("qa_guidelines")
      .insert({
        tenant_id: tenantId,
        name: input.name?.trim() || "默认QA准则",
        scope: "global",
        content_md: input.contentMd.trim(),
        is_active: true,
        version: 1
      })
      .returning(["guideline_id", "name", "content_md", "version", "is_active", "created_at", "updated_at"]);
    return serializeQaGuideline(row);
  });
}

export async function ensureActiveQaGuideline(
  trx: Knex | Knex.Transaction,
  tenantId: string,
  preferredGuidelineId?: string
): Promise<QaGuidelineView> {
  const preferred = preferredGuidelineId
    ? await trx("qa_guidelines")
        .where({ tenant_id: tenantId, guideline_id: preferredGuidelineId })
        .first<Record<string, unknown> | undefined>()
    : undefined;
  if (preferred) {
    return serializeQaGuideline(preferred);
  }

  const existing = await trx("qa_guidelines")
    .where({ tenant_id: tenantId, is_active: true })
    .orderBy("updated_at", "desc")
    .first<Record<string, unknown> | undefined>();
  if (existing) {
    return serializeQaGuideline(existing);
  }

  const [created] = await trx("qa_guidelines")
    .insert({
      tenant_id: tenantId,
      name: "默认QA准则",
      scope: "global",
      content_md: DEFAULT_GUIDELINE,
      is_active: true,
      version: 1
    })
    .returning(["guideline_id", "name", "content_md", "version", "is_active", "created_at", "updated_at"]);

  return serializeQaGuideline(created);
}

function serializeQaGuideline(row: Record<string, unknown>): QaGuidelineView {
  return {
    guidelineId: String(row.guideline_id),
    name: typeof row.name === "string" ? row.name : "默认QA准则",
    contentMd: typeof row.content_md === "string" ? row.content_md : DEFAULT_GUIDELINE,
    version: Number(row.version ?? 1),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? toIsoString(row.created_at) : null,
    updatedAt: row.updated_at ? toIsoString(row.updated_at) : null
  };
}
