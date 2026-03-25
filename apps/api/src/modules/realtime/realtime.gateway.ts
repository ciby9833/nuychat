import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

import { assertActiveAccessPayload, type AccessPayload } from "../auth/auth-session.service.js";
import { realtimeEventBus, type RealtimeEvents } from "./realtime.events.js";

export function createRealtimeGateway(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? "*"
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = readAccessToken(socket);
      if (!token) {
        return next(new Error("Access token required"));
      }

      const payload = await app.jwt.verify<AccessPayload>(token);
      if (payload.type !== "access" || payload.scope === "platform") {
        return next(new Error("Invalid realtime token"));
      }
      await assertActiveAccessPayload(payload);

      socket.data.auth = payload;
      return next();
    } catch {
      return next(new Error("Realtime auth failed"));
    }
  });

  io.on("connection", (socket) => {
    const payload = socket.data.auth as AccessPayload | undefined;
    const tenantId = payload?.tenantId;
    const agentId = payload?.agentId ?? undefined;

    if (tenantId) {
      socket.join(roomForTenant(tenantId));
    }

    if (tenantId && agentId) {
      socket.join(roomForAgent(tenantId, agentId));
    }

    socket.emit("connection.ready", {
      tenantId: tenantId ?? null,
      agentId: agentId ?? null,
      socketId: socket.id
    });
  });

  const unsubscribers = [
    subscribe("conversation.created"),
    subscribe("conversation.updated"),
    subscribe("message.received"),
    subscribe("message.sent"),
    subscribe("message.updated"),
    subscribe("task.updated")
  ];

  app.addHook("onClose", async () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    await realtimeEventBus.close();
    await io.close();
  });

  return io;

  function subscribe<K extends keyof RealtimeEvents>(event: K) {
    return realtimeEventBus.onEvent(event, (payload) => {
      io.to(roomForTenant(payload.tenantId)).emit(event, payload);
    });
  }
}

function roomForTenant(tenantId: string) {
  return `tenant:${tenantId}`;
}

function roomForAgent(tenantId: string, agentId: string) {
  return `tenant:${tenantId}:agent:${agentId}`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readAccessToken(socket: { handshake: { auth?: Record<string, unknown>; headers: Record<string, unknown> } }) {
  const authToken = readString(socket.handshake.auth?.token);
  if (authToken) return authToken;

  const header = readString(socket.handshake.headers.authorization);
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return undefined;
}
