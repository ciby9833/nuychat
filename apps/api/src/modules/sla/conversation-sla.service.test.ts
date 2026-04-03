import { describe, expect, it } from "vitest";

import { deriveInboundTimeoutPlan } from "./conversation-sla.service.js";

describe("deriveInboundTimeoutPlan", () => {
  it("首响超时只告警，不会因为保留人工 owner 去排重分配", () => {
    const plan = deriveInboundTimeoutPlan({
      definition: {
        definitionId: "d1",
        firstResponseTargetSec: 300,
        assignmentAcceptTargetSec: 300,
        subsequentResponseTargetSec: 300,
        followUpTargetSec: 600,
        resolutionTargetSec: 7200
      },
      queueStatus: "assigned",
      preserveHumanOwner: true,
      hasServiceReply: false
    });

    expect(plan.scheduleFirstResponse).toBe(true);
    expect(plan.scheduleAssignmentAccept).toBe(false);
    expect(plan.scheduleSubsequentResponse).toBe(false);
  });

  it("未接手超时会进入重分配链路", () => {
    const plan = deriveInboundTimeoutPlan({
      definition: {
        definitionId: "d1",
        firstResponseTargetSec: 300,
        assignmentAcceptTargetSec: 300,
        subsequentResponseTargetSec: 300,
        followUpTargetSec: 600,
        resolutionTargetSec: 7200
      },
      queueStatus: "assigned",
      preserveHumanOwner: false,
      hasServiceReply: false
    });

    expect(plan.scheduleFirstResponse).toBe(true);
    expect(plan.scheduleAssignmentAccept).toBe(true);
    expect(plan.scheduleSubsequentResponse).toBe(false);
  });

  it("已接待后不会再排未接手重分配，只进入 follow-up", () => {
    const plan = deriveInboundTimeoutPlan({
      definition: {
        definitionId: "d1",
        firstResponseTargetSec: 300,
        assignmentAcceptTargetSec: 300,
        subsequentResponseTargetSec: 300,
        followUpTargetSec: 600,
        resolutionTargetSec: 7200
      },
      queueStatus: "resolved",
      preserveHumanOwner: false,
      hasServiceReply: true
    });

    expect(plan.scheduleFirstResponse).toBe(false);
    expect(plan.scheduleAssignmentAccept).toBe(false);
    expect(plan.scheduleSubsequentResponse).toBe(false);
  });

  it("已回复后客户再次发言会进入后续回复 SLA，而不是复用首响", () => {
    const plan = deriveInboundTimeoutPlan({
      definition: {
        definitionId: "d1",
        firstResponseTargetSec: 300,
        assignmentAcceptTargetSec: 300,
        subsequentResponseTargetSec: 180,
        followUpTargetSec: 600,
        resolutionTargetSec: 7200
      },
      queueStatus: "assigned",
      preserveHumanOwner: true,
      hasServiceReply: true
    });

    expect(plan.scheduleFirstResponse).toBe(false);
    expect(plan.scheduleAssignmentAccept).toBe(false);
    expect(plan.scheduleSubsequentResponse).toBe(true);
  });
});
