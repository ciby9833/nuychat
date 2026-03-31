import { Redis } from "ioredis";

import { readRequiredEnv, readRequiredIntEnv } from "../env.js";

export function createRedisConnection() {
  return new Redis({
    host: readRequiredEnv("REDIS_HOST"),
    port: readRequiredIntEnv("REDIS_PORT"),
    maxRetriesPerRequest: null
  });
}

export const redisConnection = createRedisConnection();

export function closeRedisConnection() {
  return redisConnection.quit();
}

export function duplicateRedisConnection() {
  return createRedisConnection();
}
