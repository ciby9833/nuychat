/**
 * 作用:
 * - 周期性扫描 WA 监控未分析消息。
 *
 * 交互:
 * - 消息接收链路只负责入库；该 worker 低并发、小批量补齐分析结果。
 */
import { Worker } from "bullmq";

import { waMonitorAnalysisQueue, type WaMonitorAnalysisJobPayload } from "../infra/queue/queues.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import { processWaMonitorAnalysisJob } from "../modules/wa-workspace/wa-monitor.service.js";

export function createWaMonitorAnalysisWorker() {
  const workerConnection = duplicateRedisConnection();

  return new Worker<WaMonitorAnalysisJobPayload>(
    waMonitorAnalysisQueue.name,
    async (job) => processWaMonitorAnalysisJob(job.data),
    {
      connection: workerConnection,
      concurrency: 1
    }
  );
}
