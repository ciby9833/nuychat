import { withTenantTransaction } from "../../infra/db/client.js";
import { outboundQueue } from "../../infra/queue/queues.js";
import { RoutingNoticeService } from "../routing-engine/routing-notice.service.js";
import { serviceModeEventBus } from "./service-mode.events.js";
import type { ServiceModeChangedEvent } from "./service-mode.types.js";

const routingNoticeService = new RoutingNoticeService();

export function registerServiceModeNoticeSubscriber() {
  return serviceModeEventBus.onEvent("service_mode.changed", (event) => {
    void (async () => {
      const scenario = resolveNoticeScenario(event);
      if (!scenario) return;
      if (!shouldSendNotice(event, scenario)) return;

      const notice = await withTenantTransaction(event.tenantId, async (trx) =>
        routingNoticeService.buildNotice(trx, {
          tenantId: event.tenantId,
          conversationId: event.conversationId,
          scenario,
          aiAgentName: event.aiAgentName ?? "AI"
        })
      );

      if (!notice) return;

      await outboundQueue.add(
        "outbound.routing_notice",
        {
          tenantId: event.tenantId,
          conversationId: event.conversationId,
          channelId: event.channelId,
          channelType: event.channelType,
          message: {
            text: notice.text,
            aiAgentName: notice.aiAgentName
          }
        },
        { removeOnComplete: 100, removeOnFail: 50 }
      );
    })().catch(() => null);
  });
}

function resolveNoticeScenario(event: ServiceModeChangedEvent): "human_assigned" | "human_queue" | "fallback_ai" | null {
  switch (event.to.serviceMode) {
    case "human_assigned":
      return "human_assigned";
    case "queued_human":
      return "human_queue";
    case "fallback_ai":
      return "fallback_ai";
    default:
      return null;
  }
}

function shouldSendNotice(
  event: ServiceModeChangedEvent,
  scenario: "human_assigned" | "human_queue" | "fallback_ai"
) {
  const previousMode = event.from?.serviceMode ?? null;

  if (scenario === "fallback_ai") {
    return previousMode !== "fallback_ai";
  }

  if (scenario === "human_assigned") {
    return (
      previousMode !== "human_assigned" ||
      event.from?.assignedAgentId !== event.to.assignedAgentId
    );
  }

  if (scenario === "human_queue") {
    return previousMode !== "queued_human";
  }

  return true;
}
