import { skillRegistry } from "../skill.registry.js";

/**
 * Order lookup skill.
 * Checks ai_configs.quotas.integrations.lookup_order for a real API endpoint.
 * Falls back to mock data when the integration is not configured.
 */
skillRegistry.register({
  name: "lookup_order",
  executionMode: "async",
  description:
    "Look up an order's current status, items, and estimated delivery by order ID. " +
    "Use when a customer asks about their order, purchase, or shipment status.",
  parameters: {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "The order ID to look up (e.g. ORD12345, #ABC789)"
      }
    },
    required: ["orderId"]
  },

  async execute(input, ctx) {
    const orderId = String(input.orderId ?? "").trim();
    if (!orderId) {
      return { error: "orderId is required" };
    }

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
    const orderIntegration = integrations?.lookup_order;

    // ── Production: call real order management API ─────────────────────────────
    if (orderIntegration?.endpoint) {
      try {
        const controller = new AbortController();
        const timeoutMs = orderIntegration.timeout ?? 5000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (orderIntegration.apiKey) {
          headers["Authorization"] = `Bearer ${orderIntegration.apiKey}`;
        }

        const base = orderIntegration.endpoint.replace(/\/$/, "");
        const url = `${base}/${encodeURIComponent(orderId)}`;
        const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { error: `Order API responded ${res.status}`, detail: text.slice(0, 200) };
        }

        const data = (await res.json()) as Record<string, unknown>;
        return { ...data, orderId };
      } catch (err) {
        const isAbort = (err as Error).name === "AbortError";
        return {
          error: isAbort ? "Order API request timed out" : "Order API call failed",
          detail: isAbort ? undefined : (err as Error).message
        };
      }
    }

    // ── Fallback: mock response for development / unconfigured integrations ─────
    const mockStatuses = ["processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered"] as const;
    const status = mockStatuses[orderId.length % mockStatuses.length];

    return {
      orderId,
      status,
      placedAt: "2026-03-08T10:00:00Z",
      estimatedDelivery: status === "shipped" || status === "out_for_delivery" ? "2026-03-12" : null,
      items: [
        { name: "Sample Product A", quantity: 1, price: "IDR 150,000" },
        { name: "Sample Product B", quantity: 2, price: "IDR 80,000" }
      ],
      subtotal: "IDR 310,000",
      shippingFee: "IDR 15,000",
      total: "IDR 325,000",
      paymentMethod: "Bank Transfer",
      _mock: true
    };
  }
});
