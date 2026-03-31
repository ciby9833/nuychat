import type { FastifyInstance } from "fastify";

import { withTenantTransaction } from "../../infra/db/client.js";
import { attachTenantAdminGuard } from "../tenant/tenant-admin.auth.js";
import {
  evaluateCustomerSegmentRule,
  isUniqueViolation,
  normalizeStringArray,
  parseJsonObject,
  parseJsonStringArray,
  toIsoString
} from "../tenant/tenant-admin.shared.js";

export async function customerAdminRoutes(app: FastifyInstance) {
  attachTenantAdminGuard(app);

  app.get("/api/admin/customers/tags", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { active?: string };
    const active = query.active === "true" ? true : query.active === "false" ? false : undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("customer_tags")
        .where({ tenant_id: tenantId })
        .modify((qb) => {
          if (active !== undefined) qb.andWhere("is_active", active);
        })
        .select("tag_id", "code", "name", "color", "description", "is_active", "created_at", "updated_at")
        .orderBy("name", "asc");

      return rows.map((row: Record<string, unknown>) => ({
        tagId: row.tag_id,
        code: row.code,
        name: row.name,
        color: row.color,
        description: row.description,
        isActive: Boolean(row.is_active),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      }));
    });
  });

  app.post("/api/admin/customers/tags", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { code?: string; name?: string; color?: string; description?: string; isActive?: boolean };
    const code = body.code?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!code || !name) throw app.httpErrors.badRequest("code and name are required");

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const [row] = await trx("customer_tags")
          .insert({
            tenant_id: tenantId,
            code,
            name,
            color: body.color?.trim() || "#1677ff",
            description: body.description?.trim() || null,
            is_active: body.isActive ?? true
          })
          .returning(["tag_id", "code", "name", "color", "description", "is_active", "created_at", "updated_at"]);

        return {
          tagId: row.tag_id,
          code: row.code,
          name: row.name,
          color: row.color,
          description: row.description,
          isActive: Boolean(row.is_active),
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Tag code already exists");
        throw error;
      }
    });
  });

  app.patch("/api/admin/customers/tags/:tagId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { tagId } = req.params as { tagId: string };
    const body = req.body as { name?: string; color?: string; description?: string; isActive?: boolean };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.color !== undefined) updates.color = body.color.trim() || "#1677ff";
      if (body.description !== undefined) updates.description = body.description.trim() || null;
      if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

      const [row] = await trx("customer_tags")
        .where({ tenant_id: tenantId, tag_id: tagId })
        .update(updates)
        .returning(["tag_id", "code", "name", "color", "description", "is_active", "created_at", "updated_at"]);

      if (!row) throw app.httpErrors.notFound("Tag not found");
      return {
        tagId: row.tag_id,
        code: row.code,
        name: row.name,
        color: row.color,
        description: row.description,
        isActive: Boolean(row.is_active),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });

  app.get("/api/admin/customers/segments", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const query = req.query as { active?: string };
    const active = query.active === "true" ? true : query.active === "false" ? false : undefined;

    return withTenantTransaction(tenantId, async (trx) => {
      const rows = await trx("customer_segments")
        .where({ tenant_id: tenantId })
        .modify((qb) => {
          if (active !== undefined) qb.andWhere("is_active", active);
        })
        .select("segment_id", "code", "name", "description", "rule_json", "is_active", "created_at", "updated_at")
        .orderBy("name", "asc");

      return rows.map((row: Record<string, unknown>) => ({
        segmentId: row.segment_id,
        code: row.code,
        name: row.name,
        description: row.description,
        rule: parseJsonObject(row.rule_json),
        isActive: Boolean(row.is_active),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      }));
    });
  });

  app.post("/api/admin/customers/segments", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const body = req.body as { code?: string; name?: string; description?: string; rule?: Record<string, unknown>; isActive?: boolean };
    const code = body.code?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!code || !name) throw app.httpErrors.badRequest("code and name are required");

    return withTenantTransaction(tenantId, async (trx) => {
      try {
        const [row] = await trx("customer_segments")
          .insert({
            tenant_id: tenantId,
            code,
            name,
            description: body.description?.trim() || null,
            rule_json: body.rule ?? {},
            is_active: body.isActive ?? true
          })
          .returning(["segment_id", "code", "name", "description", "rule_json", "is_active", "created_at", "updated_at"]);

        return {
          segmentId: row.segment_id,
          code: row.code,
          name: row.name,
          description: row.description,
          rule: parseJsonObject(row.rule_json),
          isActive: Boolean(row.is_active),
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at)
        };
      } catch (error) {
        if (isUniqueViolation(error)) throw app.httpErrors.conflict("Segment code already exists");
        throw error;
      }
    });
  });

  app.patch("/api/admin/customers/segments/:segmentId", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { segmentId } = req.params as { segmentId: string };
    const body = req.body as { name?: string; description?: string; rule?: Record<string, unknown>; isActive?: boolean };

    return withTenantTransaction(tenantId, async (trx) => {
      const updates: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.description !== undefined) updates.description = body.description.trim() || null;
      if (body.rule !== undefined) updates.rule_json = body.rule;
      if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

      const [row] = await trx("customer_segments")
        .where({ tenant_id: tenantId, segment_id: segmentId })
        .update(updates)
        .returning(["segment_id", "code", "name", "description", "rule_json", "is_active", "created_at", "updated_at"]);

      if (!row) throw app.httpErrors.notFound("Segment not found");
      return {
        segmentId: row.segment_id,
        code: row.code,
        name: row.name,
        description: row.description,
        rule: parseJsonObject(row.rule_json),
        isActive: Boolean(row.is_active),
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      };
    });
  });

  app.get("/api/admin/customers", async (req) => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");

    const query = req.query as { search?: string; tagId?: string; segmentId?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize ?? 20)));

    return withTenantTransaction(tenantId, async (trx) => {
      const segmentRule = query.segmentId
        ? await trx("customer_segments").where({ tenant_id: tenantId, segment_id: query.segmentId, is_active: true }).select("rule_json").first<{ rule_json: unknown }>()
        : null;

      const baseRows = await trx("customers as cu")
        .where("cu.tenant_id", tenantId)
        .modify((qb) => {
          if (query.search?.trim()) {
            const like = `%${query.search.trim()}%`;
            qb.andWhere((scope) => scope.whereILike("cu.display_name", like).orWhereILike("cu.external_ref", like));
          }
        })
        .select("cu.customer_id", "cu.display_name", "cu.external_ref", "cu.primary_channel", "cu.tier", "cu.language", "cu.tags", "cu.updated_at")
        .orderBy("cu.updated_at", "desc")
        .limit(pageSize * 3)
        .offset((page - 1) * pageSize);

      const customerIds = baseRows.map((row: Record<string, unknown>) => row.customer_id as string);
      if (customerIds.length === 0) return { page, pageSize, total: 0, items: [] };

      const [tagMapRows, conversationStatsRows, taskStatsRows, caseStatsRows, latestCaseRows] = await Promise.all([
        trx("customer_tag_map as ctm")
          .join("customer_tags as ct", function joinTag() {
            this.on("ct.tag_id", "=", "ctm.tag_id").andOn("ct.tenant_id", "=", "ctm.tenant_id");
          })
          .where("ctm.tenant_id", tenantId)
          .whereIn("ctm.customer_id", customerIds)
          .where("ct.is_active", true)
          .select("ctm.customer_id", "ct.tag_id", "ct.code", "ct.name", "ct.color"),
        trx("conversations")
          .where("tenant_id", tenantId)
          .whereIn("customer_id", customerIds)
          .groupBy("customer_id")
          .select("customer_id")
          .count<{ conv_count: string }>("conversation_id as conv_count")
          .max<{ last_contact_at: string }>("updated_at as last_contact_at"),
        trx("async_tasks")
          .where("tenant_id", tenantId)
          .whereIn("customer_id", customerIds)
          .groupBy("customer_id")
          .select("customer_id")
          .count<{ task_count: string }>("task_id as task_count"),
        trx("conversation_cases as cc")
          .join("conversations as c", function joinConversation() {
            this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
          })
          .where("cc.tenant_id", tenantId)
          .whereIn("c.customer_id", customerIds)
          .groupBy("c.customer_id")
          .select("c.customer_id")
          .count<{ case_count: string }>("cc.case_id as case_count")
          .select(trx.raw("sum(case when cc.status in ('open', 'in_progress') then 1 else 0 end) as open_case_count"))
          .select(trx.raw("sum(case when cc.status in ('resolved', 'closed') then 1 else 0 end) as resolved_case_count"))
          .max<{ last_case_at: string }>("cc.last_activity_at as last_case_at"),
        trx("conversation_cases as cc")
          .join("conversations as c", function joinConversation() {
            this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
          })
          .where("cc.tenant_id", tenantId)
          .whereIn("c.customer_id", customerIds)
          .distinctOn("c.customer_id")
          .select("c.customer_id", "cc.case_id", "cc.title", "cc.last_activity_at")
          .orderBy("c.customer_id")
          .orderBy("cc.last_activity_at", "desc")
          .orderBy("cc.case_id", "desc")
      ]) as unknown as [
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>
      ];

      const tagsByCustomer = tagMapRows.reduce<Record<string, Array<{ tagId: string; code: string; name: string; color: string }>>>((acc, row) => {
        const key = row.customer_id as string;
        if (!acc[key]) acc[key] = [];
        acc[key]!.push({ tagId: row.tag_id as string, code: row.code as string, name: row.name as string, color: row.color as string });
        return acc;
      }, {});

      const convStatsByCustomer = conversationStatsRows.reduce<Record<string, { conversationCount: number; lastContactAt: string | null }>>((acc, row) => {
        acc[row.customer_id as string] = {
          conversationCount: Number((row as { conv_count?: string }).conv_count ?? 0),
          lastContactAt: (row as { last_contact_at?: string }).last_contact_at ?? null
        };
        return acc;
      }, {});

      const taskStatsByCustomer = taskStatsRows.reduce<Record<string, { taskCount: number }>>((acc, row) => {
        acc[row.customer_id as string] = { taskCount: Number((row as { task_count?: string }).task_count ?? 0) };
        return acc;
      }, {});

      const caseStatsByCustomer = caseStatsRows.reduce<Record<string, { caseCount: number; openCaseCount: number; resolvedCaseCount: number; lastCaseAt: string | null }>>((acc, row) => {
        acc[row.customer_id as string] = {
          caseCount: Number((row as { case_count?: string }).case_count ?? 0),
          openCaseCount: Number((row as { open_case_count?: string }).open_case_count ?? 0),
          resolvedCaseCount: Number((row as { resolved_case_count?: string }).resolved_case_count ?? 0),
          lastCaseAt: (row as { last_case_at?: string }).last_case_at ?? null
        };
        return acc;
      }, {});

      const latestCaseByCustomer = latestCaseRows.reduce<Record<string, { lastCaseId: string | null; lastCaseTitle: string | null }>>((acc, row) => {
        const customerId = row.customer_id as string;
        if (!acc[customerId]) {
          acc[customerId] = { lastCaseId: (row.case_id as string | undefined) ?? null, lastCaseTitle: (row.title as string | undefined) ?? null };
        }
        return acc;
      }, {});

      let items = baseRows.map((row: Record<string, unknown>) => {
        const customerId = row.customer_id as string;
        const tags = tagsByCustomer[customerId] ?? [];
        const convStats = convStatsByCustomer[customerId] ?? { conversationCount: 0, lastContactAt: null };
        const taskStats = taskStatsByCustomer[customerId] ?? { taskCount: 0 };
        const caseStats = caseStatsByCustomer[customerId] ?? { caseCount: 0, openCaseCount: 0, resolvedCaseCount: 0, lastCaseAt: null };
        const latestCase = latestCaseByCustomer[customerId] ?? { lastCaseId: null, lastCaseTitle: null };
        return {
          customerId,
          name: row.display_name,
          reference: row.external_ref,
          channel: row.primary_channel,
          tier: row.tier,
          language: row.language,
          tags,
          conversationCount: convStats.conversationCount,
          taskCount: taskStats.taskCount,
          lastContactAt: convStats.lastContactAt ? toIsoString(convStats.lastContactAt) : null,
          caseCount: caseStats.caseCount,
          openCaseCount: caseStats.openCaseCount,
          resolvedCaseCount: caseStats.resolvedCaseCount,
          lastCaseAt: caseStats.lastCaseAt ? toIsoString(caseStats.lastCaseAt) : null,
          lastCaseId: latestCase.lastCaseId,
          lastCaseTitle: latestCase.lastCaseTitle,
          updatedAt: toIsoString(row.updated_at as string)
        };
      });

      if (query.tagId) {
        items = items.filter((item: { tags: Array<{ tagId: string }> }) => item.tags.some((tag) => tag.tagId === query.tagId));
      }

      if (segmentRule?.rule_json) {
        const rule = parseJsonObject(segmentRule.rule_json);
        items = items.filter((item: any) => evaluateCustomerSegmentRule(item, rule));
      }

      return { page, pageSize, total: items.length, items: items.slice(0, pageSize) };
    });
  });

  app.post("/api/admin/customers/:customerId/tags", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorIdentityId = req.auth?.sub ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { customerId } = req.params as { customerId: string };
    const body = req.body as { tagIds?: string[]; source?: "manual" | "rule" | "import"; note?: string };
    const tagIds = Array.isArray(body.tagIds) ? normalizeStringArray(body.tagIds) : [];

    return withTenantTransaction(tenantId, async (trx) => {
      const customer = await trx("customers").where({ tenant_id: tenantId, customer_id: customerId }).first();
      if (!customer) throw app.httpErrors.notFound("Customer not found");

      if (tagIds.length === 0) {
        await trx("customer_tag_map").where({ tenant_id: tenantId, customer_id: customerId }).del();
        await trx("customers").where({ tenant_id: tenantId, customer_id: customerId }).update({ tags: JSON.stringify([]), updated_at: trx.fn.now() });
        return { customerId, updated: true, tags: [] as string[] };
      }

      const validTags = await trx("customer_tags").where({ tenant_id: tenantId, is_active: true }).whereIn("tag_id", tagIds).select("tag_id", "code");
      if (validTags.length !== tagIds.length) throw app.httpErrors.badRequest("tagIds contains unknown/disabled tag");

      await trx("customer_tag_map").where({ tenant_id: tenantId, customer_id: customerId }).del();
      await trx("customer_tag_map").insert(validTags.map((tag) => ({
        tenant_id: tenantId,
        customer_id: customerId,
        tag_id: tag.tag_id as string,
        source: body.source ?? "manual",
        note: body.note?.trim() || null,
        assigned_by_identity_id: actorIdentityId
      })));

      const tagCodes = validTags.map((row) => String(row.code));
      await trx("customers").where({ tenant_id: tenantId, customer_id: customerId }).update({ tags: JSON.stringify(tagCodes), updated_at: trx.fn.now() });
      return { customerId, updated: true, tags: tagCodes };
    });
  });

  app.post("/api/admin/customers/segments/:segmentId/apply", async (req) => {
    const tenantId = req.tenant?.tenantId;
    const actorIdentityId = req.auth?.sub ?? null;
    if (!tenantId) throw app.httpErrors.badRequest("Missing tenant context");
    const { segmentId } = req.params as { segmentId: string };
    const body = req.body as { applyTagId?: string };

    return withTenantTransaction(tenantId, async (trx) => {
      const segment = await trx("customer_segments")
        .where({ tenant_id: tenantId, segment_id: segmentId, is_active: true })
        .select("segment_id", "rule_json")
        .first<{ segment_id: string; rule_json: unknown }>();
      if (!segment) throw app.httpErrors.notFound("Segment not found");

      let applyTagCode: string | null = null;
      let applyTagId: string | null = null;
      if (body.applyTagId) {
        const tag = await trx("customer_tags")
          .where({ tenant_id: tenantId, tag_id: body.applyTagId, is_active: true })
          .select("tag_id", "code")
          .first<{ tag_id: string; code: string }>();
        if (!tag) throw app.httpErrors.badRequest("applyTagId invalid");
        applyTagCode = tag.code;
        applyTagId = tag.tag_id;
      }

      const customers = await trx("customers").where({ tenant_id: tenantId }).select("customer_id", "display_name", "external_ref", "primary_channel", "tier", "language", "tags", "updated_at");
      const customerIds = customers.map((row: Record<string, unknown>) => row.customer_id as string);

      const [convStatsRows, taskStatsRows, caseStatsRows] = await Promise.all([
        trx("conversations")
          .where("tenant_id", tenantId)
          .whereIn("customer_id", customerIds)
          .groupBy("customer_id")
          .select("customer_id")
          .count<{ conv_count: string }>("conversation_id as conv_count")
          .max<{ last_contact_at: string }>("updated_at as last_contact_at"),
        trx("async_tasks")
          .where("tenant_id", tenantId)
          .whereIn("customer_id", customerIds)
          .groupBy("customer_id")
          .select("customer_id")
          .count<{ task_count: string }>("task_id as task_count"),
        trx("conversation_cases as cc")
          .join("conversations as c", function joinConversation() {
            this.on("c.conversation_id", "=", "cc.conversation_id").andOn("c.tenant_id", "=", "cc.tenant_id");
          })
          .where("cc.tenant_id", tenantId)
          .whereIn("c.customer_id", customerIds)
          .groupBy("c.customer_id")
          .select("c.customer_id")
          .count<{ case_count: string }>("cc.case_id as case_count")
          .count<{ open_case_count: string }>(trx.raw("case when cc.status in ('open', 'in_progress') then 1 end as open_case_count"))
          .max<{ last_case_at: string }>("cc.last_activity_at as last_case_at")
      ]) as unknown as [Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>];

      const convStatsByCustomer = convStatsRows.reduce<Record<string, { conversationCount: number; lastContactAt: string | null }>>((acc, row) => {
        acc[row.customer_id as string] = {
          conversationCount: Number((row as { conv_count?: string }).conv_count ?? 0),
          lastContactAt: (row as { last_contact_at?: string }).last_contact_at ?? null
        };
        return acc;
      }, {});

      const taskStatsByCustomer = taskStatsRows.reduce<Record<string, { taskCount: number }>>((acc, row) => {
        acc[row.customer_id as string] = { taskCount: Number((row as { task_count?: string }).task_count ?? 0) };
        return acc;
      }, {});

      const caseStatsByCustomer = caseStatsRows.reduce<Record<string, { caseCount: number; openCaseCount: number; lastCaseAt: string | null }>>((acc, row) => {
        acc[row.customer_id as string] = {
          caseCount: Number((row as { case_count?: string }).case_count ?? 0),
          openCaseCount: Number((row as { open_case_count?: string }).open_case_count ?? 0),
          lastCaseAt: (row as { last_case_at?: string }).last_case_at ?? null
        };
        return acc;
      }, {});

      const rule = parseJsonObject(segment.rule_json);
      const matched = customers.filter((row: Record<string, unknown>) => {
        const customerId = row.customer_id as string;
        return evaluateCustomerSegmentRule({
          customerId,
          name: row.display_name as string | null,
          reference: row.external_ref as string,
          channel: row.primary_channel as string,
          tier: row.tier as string,
          language: row.language as string,
          tags: parseJsonStringArray(row.tags).map((code) => ({ tagId: code, code, name: code, color: "#1677ff" })),
          conversationCount: convStatsByCustomer[customerId]?.conversationCount ?? 0,
          taskCount: taskStatsByCustomer[customerId]?.taskCount ?? 0,
          lastContactAt: convStatsByCustomer[customerId]?.lastContactAt ? toIsoString(convStatsByCustomer[customerId]!.lastContactAt!) : null,
          caseCount: caseStatsByCustomer[customerId]?.caseCount ?? 0,
          openCaseCount: caseStatsByCustomer[customerId]?.openCaseCount ?? 0,
          lastCaseAt: caseStatsByCustomer[customerId]?.lastCaseAt ? toIsoString(caseStatsByCustomer[customerId]!.lastCaseAt!) : null,
          updatedAt: toIsoString(row.updated_at as string)
        }, rule);
      });

      if (applyTagId && applyTagCode) {
        for (const customer of matched) {
          await trx("customer_tag_map")
            .insert({
              tenant_id: tenantId,
              customer_id: customer.customerId,
              tag_id: applyTagId,
              source: "rule",
              note: `segment:${segmentId}`,
              assigned_by_identity_id: actorIdentityId
            })
            .onConflict(["tenant_id", "customer_id", "tag_id"])
            .merge({
              source: "rule",
              note: `segment:${segmentId}`,
              assigned_by_identity_id: actorIdentityId,
              updated_at: trx.fn.now()
            });

          const currentTags = new Set(parseJsonStringArray(customers.find((item) => item.customer_id === customer.customerId)?.tags));
          currentTags.add(applyTagCode);
          await trx("customers").where({ tenant_id: tenantId, customer_id: customer.customerId }).update({ tags: JSON.stringify(Array.from(currentTags)), updated_at: trx.fn.now() });
        }
      }

      return { segmentId, matchedCount: matched.length, appliedTagId: applyTagId, applied: Boolean(applyTagId) };
    });
  });
}
