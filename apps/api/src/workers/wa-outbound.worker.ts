/**
 * 作用:
 * - WA 独立出站队列 worker。
 *
 * 交互:
 * - 消费 infra/queue/queues 中的 wa-workspace-outbound 队列。
 * - 调用 wa-outbound.service 使用 provider adapter 真正发送消息。
 */
import { Worker } from "bullmq";

import { waWorkspaceOutboundQueue, type WaWorkspaceOutboundJobPayload } from "../infra/queue/queues.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import { processWaOutboundJob } from "../modules/wa-workspace/wa-outbound.service.js";

export function createWaOutboundWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<WaWorkspaceOutboundJobPayload>(
    waWorkspaceOutboundQueue.name,
    async (job) => processWaOutboundJob(job.data),
    {
      connection: workerConnection,
      // Retry up to 3 times with exponential backoff so transient "Connection Closed"
      // errors (Baileys socket not yet ready) have a chance to recover automatically.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 }
      }
    }
  );
}
