import { Queue } from "bullmq";

import { redisConnection } from "../redis/client.js";

export const inboundQueue = new Queue("inbound", { connection: redisConnection });
export const outboundQueue = new Queue("outbound", { connection: redisConnection });
export const analyticsQueue = new Queue("analytics", { connection: redisConnection });

