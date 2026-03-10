import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";

import { channelGateway } from "./modules/channel/channel.gateway.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: { target: "pino-pretty" },
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? "*" });
  await app.register(helmet);
  await app.register(sensible);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-me"
  });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true
  });

  app.get("/health", async () => ({
    status: "ok",
    ts: new Date().toISOString()
  }));

  await app.register(channelGateway);

  return app;
}

