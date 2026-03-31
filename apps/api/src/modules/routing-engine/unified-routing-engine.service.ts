import type { Knex } from "knex";

import { RoutingDecisionService } from "./routing-decision.service.js";
import type { RoutingContext, RoutingPlan } from "./types.js";

const routingDecisionService = new RoutingDecisionService();

export class UnifiedRoutingEngineService {
  async createPlan(
    db: Knex | Knex.Transaction,
    context: RoutingContext
  ): Promise<RoutingPlan> {
    return routingDecisionService.createPlan(db, context);
  }

  async createAgentHandoffPlan(
    db: Knex | Knex.Transaction,
    context: RoutingContext
  ): Promise<RoutingPlan> {
    return routingDecisionService.createAgentHandoffPlan(db, context);
  }

  async createAiHandoffHumanPlan(
    db: Knex | Knex.Transaction,
    context: RoutingContext
  ): Promise<RoutingPlan> {
    return routingDecisionService.createAiHandoffHumanPlan(db, context);
  }
}
