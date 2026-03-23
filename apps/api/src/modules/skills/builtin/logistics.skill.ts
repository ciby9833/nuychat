import { skillRegistry } from "../skill.registry.js";

/**
 * Shipment tracking skill.
 * Checks ai_configs.quotas.integrations.track_shipment for a real carrier API endpoint.
 * Falls back to mock data when the integration is not configured.
 */
skillRegistry.register({
  name: "track_shipment",
  executionMode: "async",
  description:
    "Track a shipment using its tracking / AWB number. Use when a customer asks about " +
    "delivery progress, current location of their parcel, or when it will arrive.",
  parameters: {
    type: "object",
    properties: {
      trackingNumber: {
        type: "string",
        description: "The shipment or AWB tracking number provided by the carrier"
      },
      carrier: {
        type: "string",
        description: "Optional carrier name (e.g. JNE, J&T, SiCepat, Pos Indonesia). Leave blank if unknown.",
        enum: ["JNE", "JnT", "SiCepat", "Pos", "Anteraja", "unknown"]
      }
    },
    required: ["trackingNumber"]
  },

  async execute(input, ctx) {
    const trackingNumber = String(input.trackingNumber ?? "").trim();
    if (!trackingNumber) {
      return { error: "trackingNumber is required" };
    }

    const carrier = String(input.carrier ?? "JNE");

    // ── Load integration config from ai_configs.quotas ─────────────────────────
    const cfg = await ctx.db("ai_configs")
      .where({ tenant_id: ctx.tenantId, is_active: true })
      .select("quotas")
      .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
      .first<{ quotas: unknown }>();

    const quotas: Record<string, unknown> =
      typeof cfg?.quotas === "string"
        ? (JSON.parse(cfg.quotas) as Record<string, unknown>)
        : ((cfg?.quotas as Record<string, unknown>) ?? {});

    const integrations = quotas.integrations as
      | Record<string, { endpoint?: string; apiKey?: string; timeout?: number }>
      | undefined;
    const trackIntegration = integrations?.track_shipment;

    // ── Production: call real carrier tracking API ─────────────────────────────
    if (trackIntegration?.endpoint) {
      try {
        const controller = new AbortController();
        const timeoutMs = trackIntegration.timeout ?? 5000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (trackIntegration.apiKey) {
          headers["Authorization"] = `Bearer ${trackIntegration.apiKey}`;
        }

        const base = trackIntegration.endpoint.replace(/\/$/, "");
        const params = new URLSearchParams({ carrier, waybill: trackingNumber });
        const url = `${base}?${params.toString()}`;
        const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { error: `Tracking API responded ${res.status}`, detail: text.slice(0, 200) };
        }

        const data = (await res.json()) as Record<string, unknown>;
        return { ...data, trackingNumber, carrier };
      } catch (err) {
        const isAbort = (err as Error).name === "AbortError";
        return {
          error: isAbort ? "Tracking API request timed out" : "Tracking API call failed",
          detail: isAbort ? undefined : (err as Error).message
        };
      }
    }

    // ── Fallback: mock response for development / unconfigured integrations ─────
    const mockEvents = [
      { timestamp: "2026-03-10T08:30:00Z", location: "Jakarta Pusat Hub", description: "Package arrived at sorting center" },
      { timestamp: "2026-03-10T11:00:00Z", location: "Jakarta Pusat Hub", description: "Package dispatched to delivery courier" },
      { timestamp: "2026-03-10T14:20:00Z", location: "Kelapa Gading", description: "Package out for delivery" }
    ];

    return {
      trackingNumber,
      carrier,
      status: "Out for Delivery",
      lastUpdate: "2026-03-10T14:20:00Z",
      lastLocation: "Kelapa Gading",
      estimatedDelivery: "Today by 9:00 PM",
      events: mockEvents,
      _mock: true
    };
  }
});
