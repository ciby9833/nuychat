import { buildApp } from "./app.js";
import { assertExpectedDevelopmentDatabase } from "./infra/db/config.js";
import { readRequiredEnv, readRequiredIntEnv } from "./infra/env.js";
import { createRealtimeGateway } from "./modules/realtime/realtime.gateway.js";
import { createInboundWorker } from "./workers/inbound.worker.js";
import { createOutboundWorker } from "./workers/outbound.worker.js";
import { createRoutingWorker } from "./workers/routing.worker.js";
import {
  createTaskBackgroundWorker,
  createTaskScriptWorker
} from "./workers/task-engine.worker.js";
import { createCustomerProfileRefreshWorker } from "./workers/customer-profile-refresh.worker.js";
import { createConversationTimeoutWorker } from "./workers/conversation-timeout.worker.js";
import { createWaOutboundWorker } from "./workers/wa-outbound.worker.js";
import { initClickhouseTables } from "./infra/clickhouse/client.js";
import { customerProfileRefreshQueue } from "./infra/queue/queues.js";
import { recoverOverdueAssignmentAcceptTimeouts, recoverOverdueFollowUpTimeouts } from "./modules/sla/conversation-sla.service.js";
import { registerServiceModeNoticeSubscriber } from "./modules/service-mode/service-mode-notice.subscriber.js";
import { runWaStartup } from "./modules/wa-workspace/wa-startup.service.js";

const port = readRequiredIntEnv("PORT");
const host = readRequiredEnv("HOST");
const dbSummary = assertExpectedDevelopmentDatabase();

const app = await buildApp();
const inboundWorker = createInboundWorker();
const outboundWorker = createOutboundWorker();
const routingWorker = createRoutingWorker();
const taskBackgroundWorker = createTaskBackgroundWorker();
const taskScriptWorker = createTaskScriptWorker();
const customerProfileRefreshWorker = createCustomerProfileRefreshWorker();
const conversationTimeoutWorker = createConversationTimeoutWorker();
const waOutboundWorker = createWaOutboundWorker();
createRealtimeGateway(app);
const unsubscribeServiceModeNotice = registerServiceModeNoticeSubscriber();

// Fire-and-forget: initialise ClickHouse tables (no-ops if CH unavailable)
void initClickhouseTables();
void recoverOverdueAssignmentAcceptTimeouts()
  .then((count) => {
    if (count > 0) app.log.info({ recovered: count }, "Recovered overdue assignment reassign timers");
  })
  .catch((error) => {
    app.log.warn({ err: error }, "Failed to recover overdue assignment reassign timers");
  });
void recoverOverdueFollowUpTimeouts()
  .then((count) => {
    if (count > 0) app.log.info({ recovered: count }, "Recovered overdue follow-up timers");
  })
  .catch((error) => {
    app.log.warn({ err: error }, "Failed to recover overdue follow-up timers");
  });
void customerProfileRefreshQueue.add(
  "customer-profile.refresh",
  { limit: 100 },
  {
    jobId: "customer-profile.refresh.default",
    repeat: { every: 10 * 60 * 1000 },
    removeOnComplete: 20,
    removeOnFail: 20
  }
);

try {
  await app.listen({ port, host });
  app.log.info({ db: dbSummary }, `API running at http://${host}:${port}`);
  // Restore WA Baileys runtimes and re-enqueue any stuck outbound jobs after startup.
  void runWaStartup();
} catch (error) {
  app.log.error(error);
  await inboundWorker.close();
  await outboundWorker.close();
  await routingWorker.close();
  await taskBackgroundWorker.close();
  await taskScriptWorker.close();
  await customerProfileRefreshWorker.close();
  await conversationTimeoutWorker.close();
  await waOutboundWorker.close();
  unsubscribeServiceModeNotice();
  process.exit(1);
}

const shutdown = async () => {
  await inboundWorker.close();
  await outboundWorker.close();
  await routingWorker.close();
  await taskBackgroundWorker.close();
  await taskScriptWorker.close();
  await customerProfileRefreshWorker.close();
  await conversationTimeoutWorker.close();
  await waOutboundWorker.close();
  unsubscribeServiceModeNotice();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
