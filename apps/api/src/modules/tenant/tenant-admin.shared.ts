export function normalizeNonEmptyString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value : null;
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

export function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeStringArray(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}

export function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function parseJsonNumberMap(value: unknown): Record<string, number> {
  const parsed = parseJsonObject(value);
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(parsed)) {
    const n = Number(item);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toIsoString(value: unknown): string {
  return new Date(String(value)).toISOString();
}

export function evaluateCustomerSegmentRule(
  customer: {
    customerId?: string;
    tier?: string;
    tags?: Array<{ code: string }>;
    conversationCount?: number;
    taskCount?: number;
    lastContactAt?: string | null;
    caseCount?: number;
    openCaseCount?: number;
    lastCaseAt?: string | null;
    language?: string;
    channel?: string;
    name?: string | null;
    reference?: string;
    updatedAt?: string;
  },
  rule: Record<string, unknown>
): boolean {
  const tags = new Set((customer.tags ?? []).map((tag) => tag.code.toLowerCase()));

  const tagsAny = parseJsonStringArray(rule.tagsAny);
  if (tagsAny.length > 0 && !tagsAny.some((tag) => tags.has(tag.toLowerCase()))) return false;

  const tagsAll = parseJsonStringArray(rule.tagsAll);
  if (tagsAll.length > 0 && !tagsAll.every((tag) => tags.has(tag.toLowerCase()))) return false;

  const tiersAny = parseJsonStringArray(rule.tiersAny);
  if (tiersAny.length > 0 && !tiersAny.includes(String(customer.tier ?? "").toLowerCase())) return false;

  const languagesAny = parseJsonStringArray(rule.languagesAny);
  if (languagesAny.length > 0 && !languagesAny.includes(String(customer.language ?? "").toLowerCase())) return false;

  const channelsAny = parseJsonStringArray(rule.channelsAny);
  if (channelsAny.length > 0 && !channelsAny.includes(String(customer.channel ?? "").toLowerCase())) return false;

  const minConversationCount = Number(rule.minConversationCount ?? 0);
  if (Number.isFinite(minConversationCount) && minConversationCount > 0 && (customer.conversationCount ?? 0) < minConversationCount) {
    return false;
  }

  const minTaskCount = Number(rule.minTaskCount ?? 0);
  if (Number.isFinite(minTaskCount) && minTaskCount > 0 && (customer.taskCount ?? 0) < minTaskCount) {
    return false;
  }

  const minCaseCount = Number(rule.minCaseCount ?? 0);
  if (Number.isFinite(minCaseCount) && minCaseCount > 0 && (customer.caseCount ?? 0) < minCaseCount) {
    return false;
  }

  const minOpenCaseCount = Number(rule.minOpenCaseCount ?? 0);
  if (Number.isFinite(minOpenCaseCount) && minOpenCaseCount > 0 && (customer.openCaseCount ?? 0) < minOpenCaseCount) {
    return false;
  }

  const daysSinceLastConversationGte = Number(rule.daysSinceLastConversationGte ?? 0);
  if (Number.isFinite(daysSinceLastConversationGte) && daysSinceLastConversationGte > 0) {
    if (!customer.lastContactAt) return true;
    const diffDays = Math.floor((Date.now() - new Date(customer.lastContactAt).getTime()) / 86_400_000);
    if (diffDays < daysSinceLastConversationGte) return false;
  }

  const daysSinceLastCaseActivityGte = Number(rule.daysSinceLastCaseActivityGte ?? 0);
  if (Number.isFinite(daysSinceLastCaseActivityGte) && daysSinceLastCaseActivityGte > 0) {
    if (!customer.lastCaseAt) return true;
    const diffDays = Math.floor((Date.now() - new Date(customer.lastCaseAt).getTime()) / 86_400_000);
    if (diffDays < daysSinceLastCaseActivityGte) return false;
  }

  return true;
}
