import { Worker } from "bullmq";

import { db } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  customerProfileRefreshQueue,
  type CustomerProfileRefreshJobPayload
} from "../infra/queue/queues.js";
import {
  claimMemoryRefreshWork,
  enqueueClaimedMemoryRefreshWork
} from "../modules/tasks/customer-profile-refresh.service.js";

export function createCustomerProfileRefreshWorker() {
  const workerConnection = duplicateRedisConnection();
  const workerId = `customer-profile-refresh:${process.pid}`;

  return new Worker<CustomerProfileRefreshJobPayload>(
    customerProfileRefreshQueue.name,
    async (job) => {
      const claimed = await claimMemoryRefreshWork({
        db,
        workerId,
        tenantId: job.data.tenantId ?? null,
        limit: Math.max(1, Math.min(job.data.limit ?? 100, 500))
      });

      if (claimed.profiles.length === 0 && claimed.memoryUnits.length === 0) {
        return { claimedProfiles: 0, claimedMemoryUnits: 0 };
      }

      await enqueueClaimedMemoryRefreshWork({
        workerId,
        claimed
      });

      return {
        claimedProfiles: claimed.profiles.length,
        claimedMemoryUnits: claimed.memoryUnits.length
      };
    },
    {
      connection: workerConnection,
      concurrency: 1
    }
  );
}
