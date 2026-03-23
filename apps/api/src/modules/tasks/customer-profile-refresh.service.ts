import type { Knex } from "knex";

import { scheduleLongTask } from "./task-scheduler.service.js";

export async function markCustomerProfileDirty(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    reason: string;
  }
) {
  await db("customer_profiles")
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      soul_profile: "{}",
      operating_notes: "{}",
      state_snapshot: "{}",
      profile_summary: "",
      profile_keywords: "",
      source_version: 1,
      indexed_version: 0,
      dirty: true,
      dirty_reason: input.reason,
      source_updated_at: db.fn.now(),
      last_indexed_at: db.fn.now()
    })
    .onConflict(["tenant_id", "customer_id"])
    .merge({
      source_version: db.raw("customer_profiles.source_version + 1"),
      dirty: true,
      dirty_reason: input.reason,
      source_updated_at: db.fn.now(),
      claimed_at: null,
      claimed_by: null,
      updated_at: db.fn.now()
    });
}

export async function claimDirtyCustomerProfiles(input: {
  db: Knex;
  workerId: string;
  limit: number;
  tenantId?: string | null;
}) {
  const tenantFilter = input.tenantId ? "AND tenant_id = ?" : "";
  const bindings: Array<string | number> = [];
  if (input.tenantId) bindings.push(input.tenantId);
  bindings.push(input.limit, input.workerId);

  const result = await input.db.raw(
    `
      WITH picked AS (
        SELECT profile_id
        FROM customer_profiles
        WHERE (dirty = true OR source_version > indexed_version)
          AND (claimed_at IS NULL OR claimed_at < now() - interval '15 minutes')
          ${tenantFilter}
        ORDER BY source_updated_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      )
      UPDATE customer_profiles c
      SET claimed_at = now(),
          claimed_by = ?,
          updated_at = now()
      FROM picked
      WHERE c.profile_id = picked.profile_id
      RETURNING c.profile_id, c.tenant_id, c.customer_id, c.source_version
    `,
    bindings
  );

  const rows = Array.isArray(result.rows) ? result.rows : [];
  return rows.map((row) => ({
    profileId: String(row.profile_id),
    tenantId: String(row.tenant_id),
    customerId: String(row.customer_id),
    sourceVersion: Number(row.source_version ?? 0)
  }));
}

export async function enqueueClaimedCustomerProfiles(input: {
  workerId: string;
  claimed: Array<{ tenantId: string; customerId: string; sourceVersion: number }>;
}) {
  for (const item of input.claimed) {
    await scheduleLongTask({
      tenantId: item.tenantId,
      customerId: item.customerId,
      conversationId: null,
      taskType: "vector_customer_profile_reindex",
      title: `Vector reindex ${item.customerId}`,
      source: "workflow",
      priority: 70,
      schedulerKey: `customer-profile:${item.customerId}:${item.sourceVersion}`,
      payload: {
        customerId: item.customerId,
        expectedSourceVersion: item.sourceVersion,
        claimedBy: input.workerId
      }
    });
  }
}
