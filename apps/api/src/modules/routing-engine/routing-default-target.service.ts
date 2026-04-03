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
      };
      assignmentStrategy: HumanDispatchTarget["assignmentStrategy"];
      priority: number;
    }
  ): Promise<HumanDispatchTarget> {
    const target: HumanDispatchTarget = {
      ...input.serviceTarget,
      assignmentStrategy: input.assignmentStrategy
    };

    const capacity = await humanDispatchService.inspectTarget(db, {
      tenantId: input.tenantId,
      target,
      priority: input.priority
    });

    if (capacity.totalAgents > 0) return target;

    return {
      departmentId: null,
      departmentCode: null,
      teamId: null,
      teamCode: null,
      assignmentStrategy: input.assignmentStrategy
    };
  }
}
