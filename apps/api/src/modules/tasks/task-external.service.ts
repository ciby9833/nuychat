import type { Knex } from "knex";

type IntegrationConfig = {
  endpoint?: string;
  apiKey?: string;
  timeout?: number;
};

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

async function getIntegrationConfig(
  db: Knex,
  tenantId: string,
  key: "lookup_order" | "track_shipment"
): Promise<IntegrationConfig | null> {
  const cfg = await db("ai_configs")
    .where({ tenant_id: tenantId, is_active: true })
    .select("quotas")
    .orderBy([{ column: "is_default", order: "desc" }, { column: "updated_at", order: "desc" }])
    .first<{ quotas: unknown }>();

  const quotas = parseObject(cfg?.quotas);
  const integrations = parseObject(quotas.integrations);
  const integration = parseObject(integrations[key]);
  return Object.keys(integration).length > 0 ? integration as IntegrationConfig : null;
}

async function fetchJson(input: {
  endpoint: string;
  timeoutMs: number;
  headers: Record<string, string>;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const res = await fetch(input.endpoint, {
      method: "GET",
      headers: input.headers,
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`upstream_${res.status}:${text.slice(0, 200)}`);
    }
    return await res.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export async function runExternalOrderLookup(
  db: Knex,
  input: { tenantId: string; orderId: string }
) {
  const integration = await getIntegrationConfig(db, input.tenantId, "lookup_order");
  if (integration?.endpoint) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (integration.apiKey) headers.Authorization = `Bearer ${integration.apiKey}`;
    const base = integration.endpoint.replace(/\/$/, "");
    const url = `${base}/${encodeURIComponent(input.orderId)}`;
    const data = await fetchJson({
      endpoint: url,
      timeoutMs: integration.timeout ?? 5000,
      headers
    });
    return { ...data, orderId: input.orderId, _async: true };
  }

  const mockStatuses = ["processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered"] as const;
  const status = mockStatuses[input.orderId.length % mockStatuses.length];
  return {
    orderId: input.orderId,
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
    _mock: true,
    _async: true
  };
}

export async function runExternalShipmentTracking(
  db: Knex,
  input: { tenantId: string; trackingNumber: string; carrier: string }
) {
  const integration = await getIntegrationConfig(db, input.tenantId, "track_shipment");
  if (integration?.endpoint) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (integration.apiKey) headers.Authorization = `Bearer ${integration.apiKey}`;
    const base = integration.endpoint.replace(/\/$/, "");
    const params = new URLSearchParams({
      carrier: input.carrier,
      waybill: input.trackingNumber
    });
    const url = `${base}?${params.toString()}`;
    const data = await fetchJson({
      endpoint: url,
      timeoutMs: integration.timeout ?? 5000,
      headers
    });
    return { ...data, trackingNumber: input.trackingNumber, carrier: input.carrier, _async: true };
  }

  return {
    trackingNumber: input.trackingNumber,
    carrier: input.carrier,
    status: "Out for Delivery",
    lastUpdate: "2026-03-10T14:20:00Z",
    lastLocation: "Kelapa Gading",
    estimatedDelivery: "Today by 9:00 PM",
    events: [
      { timestamp: "2026-03-10T08:30:00Z", location: "Jakarta Pusat Hub", description: "Package arrived at sorting center" },
      { timestamp: "2026-03-10T11:00:00Z", location: "Jakarta Pusat Hub", description: "Package dispatched to delivery courier" },
      { timestamp: "2026-03-10T14:20:00Z", location: "Kelapa Gading", description: "Package out for delivery" }
    ],
    _mock: true,
    _async: true
  };
}
