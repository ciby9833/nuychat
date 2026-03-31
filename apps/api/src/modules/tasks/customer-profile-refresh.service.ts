import type { Knex } from "knex";

import {
  scheduleCustomerProfileVectorSync,
  scheduleMemoryUnitVectorSync
} from "./task-vector-memory.service.js";

export async function markCustomerProfileDirty(
  db: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    customerId: string;
    reason: string;
  }
) {
  await db("customer_memory_profiles")
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
      index_status: "pending",
      source_updated_at: db.fn.now(),
      last_indexed_at: db.fn.now()
    })
    .onConflict(["tenant_id", "customer_id"])
    .merge({
      source_version: db.raw("customer_memory_profiles.source_version + 1"),
      dirty: true,
      dirty_reason: input.reason,
      index_status: "pending",
      index_last_error: null,
      next_retry_at: null,
      source_updated_at: db.fn.now(),
      claimed_at: null,
      claimed_by: null,
      updated_at: db.fn.now()
    });
}

export async function claimMemoryRefreshWork(input: {
  db: Knex;
  workerId: string;
  limit: number;
  tenantId?: string | null;
}) {
  const tenantFilter = input.tenantId ? "AND tenant_id = ?" : "";
  const profileBindings: Array<string | number> = [];
  if (input.tenantId) profileBindings.push(input.tenantId);
  profileBindings.push(input.limit, input.workerId);

  const profileResult = await input.db.raw(
    `
      WITH picked AS (
        SELECT profile_id
        FROM customer_memory_profiles
        WHERE (
          dirty = true
          OR source_version > indexed_version
          OR index_status IN ('pending', 'failed')
        )
          AND (next_retry_at IS NULL OR next_retry_at <= now())
          AND (claimed_at IS NULL OR claimed_at < now() - interval '15 minutes')
          ${tenantFilter}
        ORDER BY source_updated_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      )
      UPDATE customer_memory_profiles c
      SET claimed_at = now(),
          claimed_by = ?,
          updated_at = now()
      FROM picked
      WHERE c.profile_id = picked.profile_id
      RETURNING c.profile_id, c.tenant_id, c.customer_id, c.source_version
    `,
    profileBindings
  );

  const memoryBindings: Array<string | number> = [];
  if (input.tenantId) memoryBindings.push(input.tenantId);
  memoryBindings.push(input.limit);
  const memoryResult = await input.db.raw(
    `
      WITH picked AS (
        SELECT memory_unit_id, tenant_id, customer_id
        FROM customer_memory_units
        WHERE index_status IN ('pending', 'failed')
          AND status = 'active'
          AND (next_retry_at IS NULL OR next_retry_at <= now())
          ${tenantFilter}
        ORDER BY updated_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      )
      SELECT memory_unit_id, tenant_id, customer_id
      FROM picked
    `,
    memoryBindings
  );

  const profiles = Array.isArray(profileResult.rows) ? profileResult.rows : [];
  const memoryUnits = Array.isArray(memoryResult.rows) ? memoryResult.rows : [];

  return {
    profiles: profiles.map((row: any) => ({
      profileId: String(row.profile_id),
      tenantId: String(row.tenant_id),
      customerId: String(row.customer_id),
      sourceVersion: Number(row.source_version ?? 0)
    })),
    memoryUnits: memoryUnits.map((row: any) => ({
      memoryUnitId: String(row.memory_unit_id),
      tenantId: String(row.tenant_id),
      customerId: String(row.customer_id)
    }))
  };
}

export async function enqueueClaimedMemoryRefreshWork(input: {
  workerId: string;
  claimed: {
    profiles: Array<{ tenantId: string; customerId: string; sourceVersion: number }>;
    memoryUnits: Array<{ tenantId: string; customerId: string; memoryUnitId: string }>;
  };
}) {
  for (const item of input.claimed.profiles) {
    await scheduleCustomerProfileVectorSync({
      tenantId: item.tenantId,
      customerId: item.customerId,
      expectedSourceVersion: item.sourceVersion,
      priority: 70
    });
  }

  for (const item of input.claimed.memoryUnits) {
    await scheduleMemoryUnitVectorSync({
      tenantId: item.tenantId,
      customerId: item.customerId,
      memoryUnitId: item.memoryUnitId,
      priority: 72
    });
  }
}
