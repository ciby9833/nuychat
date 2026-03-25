import { buildApp } from "./app.js";
import { assertExpectedDevelopmentDatabase } from "./infra/db/config.js";
// Register all built-in skills before workers start
import "./modules/skills/index.js";
import { createRealtimeGateway } from "./modules/realtime/realtime.gateway.js";
import { createInboundWorker } from "./workers/inbound.worker.js";
import { createOutboundWorker } from "./workers/outbound.worker.js";
import { createRoutingWorker } from "./workers/routing.worker.js";
import { createTaskEngineWorker } from "./workers/task-engine.worker.js";
import { createCustomerProfileRefreshWorker } from "./workers/customer-profile-refresh.worker.js";
import { createConversationTimeoutWorker } from "./workers/conversation-timeout.worker.js";
import { initClickhouseTables } from "./infra/clickhouse/client.js";
import { customerProfileRefreshQueue } from "./infra/queue/queues.js";
import { recoverOverdueAssignmentAcceptTimeouts } from "./modules/sla/conversation-sla.service.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const dbSummary = assertExpectedDevelopmentDatabase();

const app = await buildApp();
const inboundWorker = createInboundWorker();
const outboundWorker = createOutboundWorker();
const routingWorker = createRoutingWorker();
const taskEngineWorker = createTaskEngineWorker();
const customerProfileRefreshWorker = createCustomerProfileRefreshWorker();
const conversationTimeoutWorker = createConversationTimeoutWorker();
createRealtimeGateway(app);

// Fire-and-forget: initialise ClickHouse tables (no-ops if CH unavailable)
void initClickhouseTables();
void recoverOverdueAssignmentAcceptTimeouts()
  .then((count) => {
    if (count > 0) app.log.info({ recovered: count }, "Recovered overdue assignment reassign timers");
  })
  .catch((error) => {
    app.log.warn({ err: error }, "Failed to recover overdue assignment reassign timers");
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
} catch (error) {
  app.log.error(error);
  await inboundWorker.close();
  await outboundWorker.close();
  await routingWorker.close();
  await taskEngineWorker.close();
  await customerProfileRefreshWorker.close();
  await conversationTimeoutWorker.close();
  process.exit(1);
}

const shutdown = async () => {
  await inboundWorker.close();
  await outboundWorker.close();
  await routingWorker.close();
  await taskEngineWorker.close();
  await customerProfileRefreshWorker.close();
  await conversationTimeoutWorker.close();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
