import { Worker } from "bullmq";

import { db } from "../infra/db/client.js";
import { duplicateRedisConnection } from "../infra/redis/client.js";
import {
  customerProfileRefreshQueue,
  type CustomerProfileRefreshJobPayload
} from "../infra/queue/queues.js";
import {
  claimDirtyCustomerProfiles,
  enqueueClaimedCustomerProfiles
} from "../modules/tasks/customer-profile-refresh.service.js";

export function createCustomerProfileRefreshWorker() {
  const workerConnection = duplicateRedisConnection();
  const workerId = `customer-profile-refresh:${process.pid}`;

  return new Worker<CustomerProfileRefreshJobPayload>(
    customerProfileRefreshQueue.name,
    async (job) => {
      const claimed = await claimDirtyCustomerProfiles({
        db,
        workerId,
        tenantId: job.data.tenantId ?? null,
        limit: Math.max(1, Math.min(job.data.limit ?? 100, 500))
      });

      if (claimed.length === 0) {
        return { claimed: 0 };
      }

      await enqueueClaimedCustomerProfiles({
        workerId,
        claimed: claimed.map((item) => ({
          tenantId: item.tenantId,
          customerId: item.customerId,
          sourceVersion: item.sourceVersion
        }))
      });

      return { claimed: claimed.length };
    },
    {
      connection: workerConnection,
      concurrency: 1
    }
  );
}
