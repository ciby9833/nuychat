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
    // Only send the "you're in queue" notice once — when the conversation first enters
    // the human queue. Do NOT re-send when:
    //   • Already in queued_human (same state, no meaningful change)
    //   • Coming from fallback_ai — this means the AI fallback ran temporarily while
    //     the customer was ALREADY in the human queue, then returned. The customer
    //     has already received the queue notice; sending another would be spam.
    if (previousMode === "queued_human" || previousMode === "fallback_ai") return false;
    return true;
  }

  return true;
}
