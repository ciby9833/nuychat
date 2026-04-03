import type { Knex } from "knex";

import { HumanDispatchService, type HumanDispatchTarget } from "./human-dispatch.service.js";

const humanDispatchService = new HumanDispatchService();

export class RoutingDefaultTargetService {
  async resolveHumanTarget(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      serviceTarget: {
        departmentId: string | null;
        departmentCode: string | null;
        teamId: string | null;
        teamCode: string | null;
        skillGroupCode: string | null;
      };
      assignmentStrategy: HumanDispatchTarget["assignmentStrategy"];
      priority: number;
    }
  ): Promise<HumanDispatchTarget> {
    if (input.serviceTarget.skillGroupCode) {
      return {
        ...input.serviceTarget,
        assignmentStrategy: input.assignmentStrategy
      };
    }

    const groups = await db("skill_groups")
      .where({ tenant_id: input.tenantId, is_active: true })
      .select("code", "priority", "created_at")
      .orderBy("priority", "asc")
      .orderBy("created_at", "asc") as Array<{ code: string; priority: number; created_at: string }>;

    if (groups.length === 0) {
      return {
        ...input.serviceTarget,
        assignmentStrategy: input.assignmentStrategy
      };
    }

    const capacities = await Promise.all(groups.map(async (group) => {
      const target: HumanDispatchTarget = {
        ...input.serviceTarget,
        skillGroupCode: group.code,
        assignmentStrategy: input.assignmentStrategy
      };
      const capacity = await humanDispatchService.inspectTarget(db, {
        tenantId: input.tenantId,
        target,
        priority: input.priority
      });

      return {
        target,
        priority: group.priority,
        eligibleAgents: capacity.eligibleAgents,
        loadPct: capacity.loadPct ?? 1000,
        totalAgents: capacity.totalAgents
      };
    }));

    const sorted = [...capacities].sort((left, right) => {
      if (left.eligibleAgents !== right.eligibleAgents) return right.eligibleAgents - left.eligibleAgents;
      if (left.loadPct !== right.loadPct) return left.loadPct - right.loadPct;
      if (left.totalAgents !== right.totalAgents) return right.totalAgents - left.totalAgents;
      return left.priority - right.priority;
    });

    return sorted[0]?.target ?? {
      ...input.serviceTarget,
      assignmentStrategy: input.assignmentStrategy
    };
  }
}
