/**
 * Webchat Load-Test Library
 * Real HTTP calls to the actual webchat public API — no mocks.
 *
 * Usage:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/01-dispatch.mjs
 */
import { randomUUID } from 'node:crypto';

export const CFG = {
  publicKey: process.env.VITE_WEBCHAT_PUBLIC_KEY ?? 'wc_alibaba_7d884543ce98',
  apiBase:   process.env.VITE_WEBCHAT_API_BASE   ?? 'http://localhost:3000',
};

export const BASE = `${CFG.apiBase}/api/webchat/public/${CFG.publicKey}`;

// ─────────────────────────────────────────────────────────────────────────────
// API helpers — each returns { data, latencyMs } or throws an enriched Error
// ─────────────────────────────────────────────────────────────────────────────

export async function createSession(customerRef, displayName = '测试客户', client = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerRef,
      displayName,
      client: { source: 'load_test', deviceType: 'desktop', language: 'zh-CN', ...client },
    }),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`createSession ${res.status}: ${body.slice(0, 200)}`), { status: res.status, latencyMs });
  }
  return { data: await res.json(), latencyMs };
}

export async function sendMessage(customerRef, text) {
  if (!text?.trim()) throw new Error('sendMessage: text is required');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerRef, text: text.trim() }),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`sendMessage ${res.status}: ${body.slice(0, 200)}`), { status: res.status, latencyMs });
  }
  return { data: await res.json(), latencyMs };
}

export async function fetchMessages(customerRef, since = null) {
  const url = new URL(`${BASE}/messages`);
  url.searchParams.set('customerRef', customerRef);
  if (since) url.searchParams.set('since', since);
  const t0 = Date.now();
  const res = await fetch(url.toString());
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    throw Object.assign(new Error(`fetchMessages ${res.status}`), { status: res.status, latencyMs });
  }
  return { data: await res.json(), latencyMs };
}

/**
 * Poll until at least one outbound (AI/agent) reply appears after `afterTs`.
 * Returns { found: true, message, waitMs } or { found: false, waitMs }.
 */
export async function waitForReply(customerRef, afterTs, timeoutMs = 30_000) {
  const startMs  = Date.now();
  const deadline = startMs + timeoutMs;
  let interval = 1_000;
  while (Date.now() < deadline) {
    await sleep(interval);
    interval = Math.min(interval * 1.3, 4_000);
    try {
      const { data } = await fetchMessages(customerRef, afterTs);
      const reply = data.messages?.find(
        (m) => m.direction === 'outbound' && m.sender_type !== 'customer',
      );
      if (reply) return { found: true, message: reply, waitMs: Date.now() - startMs };
    } catch { /* keep polling */ }
  }
  return { found: false, waitMs: timeoutMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency pool — limits simultaneous in-flight requests
// ─────────────────────────────────────────────────────────────────────────────
export class Pool {
  constructor(concurrency) {
    this.cap = concurrency;
    this.active = 0;
    this.q = [];
  }
  run(fn) {
    return new Promise((resolve, reject) => {
      this.q.push({ fn, resolve, reject });
      this._drain();
    });
  }
  _drain() {
    while (this.active < this.cap && this.q.length) {
      const { fn, resolve, reject } = this.q.shift();
      this.active++;
      fn()
        .then((v) => { this.active--; resolve(v); this._drain(); })
        .catch((e) => { this.active--; reject(e); this._drain(); });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats — collect latencies, errors, compute percentiles
// ─────────────────────────────────────────────────────────────────────────────
export class Stats {
  constructor(label) {
    this.label = label;
    this.latencies = [];
    this.errors = [];
    this.startMs = Date.now();
  }
  ok(latencyMs) { this.latencies.push(latencyMs); }
  err(e)        { this.errors.push({ msg: e.message, status: e.status }); }
  pct(p) {
    if (!this.latencies.length) return 0;
    const s = [...this.latencies].sort((a, b) => a - b);
    return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
  }
  summary() {
    const durationMs = Date.now() - this.startMs;
    const n = this.latencies.length;
    const avg = n ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / n) : 0;
    return {
      label:      this.label,
      total:      n + this.errors.length,
      ok:         n,
      errors:     this.errors.length,
      errorPct:   `${((this.errors.length / (n + this.errors.length || 1)) * 100).toFixed(1)}%`,
      throughput: `${(n / (durationMs / 1000)).toFixed(1)} req/s`,
      latency:    { avg: `${avg}ms`, p50: `${this.pct(50)}ms`, p95: `${this.pct(95)}ms`, p99: `${this.pct(99)}ms`, min: `${Math.min(...this.latencies) || 0}ms`, max: `${Math.max(...this.latencies) || 0}ms` },
      durationSec: (durationMs / 1000).toFixed(1),
      errorDetail: this.errors.slice(0, 5),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
export function genRef(prefix = 'u') {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function banner(title) {
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

export function printSummary(s) {
  banner(`RESULT: ${s.label}`);
  console.log(`  Total:      ${s.total}  |  OK: ${s.ok}  |  Errors: ${s.errors} (${s.errorPct})`);
  console.log(`  Throughput: ${s.throughput}  |  Duration: ${s.durationSec}s`);
  console.log(`  Latency:    avg=${s.latency.avg}  p50=${s.latency.p50}  p95=${s.latency.p95}  p99=${s.latency.p99}`);
  console.log(`              min=${s.latency.min}  max=${s.latency.max}`);
  if (s.errorDetail.length) {
    console.log('  Error sample:');
    s.errorDetail.forEach((e) => console.log(`    [${e.status ?? '?'}] ${e.msg}`));
  }
  console.log('─'.repeat(60));
}

/** Verify that the channel public key is valid before running tests */
export async function healthCheck() {
  banner(`HEALTH CHECK  key=${CFG.publicKey}  base=${CFG.apiBase}`);
  const ref = genRef('health');
  try {
    const { data, latencyMs } = await createSession(ref, '健康检查', { source: 'health_check' });
    console.log(`  ✓ Session created  conversationId=${data.conversationId}  latency=${latencyMs}ms`);
    const { data: sent, latencyMs: l2 } = await sendMessage(ref, '连接测试');
    console.log(`  ✓ Message queued   messageId=${sent.messageId}  latency=${l2}ms`);
    console.log('  ✓ Channel is reachable — proceeding with tests\n');
    return true;
  } catch (e) {
    console.error(`  ✗ Health check FAILED: ${e.message}`);
    console.error('  Ensure the API server is running and the public key exists.');
    return false;
  }
}
