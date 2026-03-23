/**
 * Test 2 — Performance / Stress
 *
 * Sends 200 sessions in waves, measuring API throughput and latency
 * under load. No waiting for AI replies — pure API layer stress.
 *
 * Phases:
 *   Wave A: 200 concurrent session creations (capped at 50 simultaneous)
 *   Wave B: 200 message sends (capped at 50 simultaneous)
 *   Wave C: 200 message polls (capped at 50 simultaneous)
 *
 * Reports p50/p95/p99 latencies and throughput for each phase.
 *
 * Run:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/02-stress.mjs
 */
import { createSession, sendMessage, fetchMessages, genRef, Pool, Stats, banner, printSummary, healthCheck } from './lib.mjs';

const TOTAL       = 200;
const CONCURRENCY = 50;   // max simultaneous HTTP connections

export async function runStressTest() {
  banner(`TEST 2 — STRESS / PERFORMANCE  (${TOTAL} sessions × 3 phases, concurrency=${CONCURRENCY})`);

  const pool = new Pool(CONCURRENCY);

  // ── Phase A: Session creation ─────────────────────────────────────────────
  console.log(`\n  [A] Session creation — ${TOTAL} unique customers…`);
  const sessionStats = new Stats('02-stress: session creation');
  const sessions = [];

  await Promise.allSettled(
    Array.from({ length: TOTAL }, (_, i) => {
      const ref = genRef('s');
      return pool.run(async () => {
        try {
          const { latencyMs } = await createSession(ref, `压力测试 ${i + 1}`);
          sessionStats.ok(latencyMs);
          sessions.push(ref);
        } catch (e) {
          sessionStats.err(e);
        }
      });
    })
  );

  printSummary(sessionStats.summary());

  // ── Phase B: Message send ─────────────────────────────────────────────────
  console.log(`  [B] Message send — ${sessions.length} messages…`);
  const sendStats = new Stats('02-stress: message send');
  const sentRefs = [];

  await Promise.allSettled(
    sessions.map((ref, i) =>
      pool.run(async () => {
        try {
          const { latencyMs } = await sendMessage(ref, `压力测试消息 ${i + 1}，请问如何查询订单？`);
          sendStats.ok(latencyMs);
          sentRefs.push(ref);
        } catch (e) {
          sendStats.err(e);
        }
      })
    )
  );

  printSummary(sendStats.summary());

  // ── Phase C: Message poll ─────────────────────────────────────────────────
  console.log(`  [C] Message poll — ${sentRefs.length} conversations…`);
  const pollStats = new Stats('02-stress: message poll');

  await Promise.allSettled(
    sentRefs.map((ref) =>
      pool.run(async () => {
        try {
          const { latencyMs } = await fetchMessages(ref, null);
          pollStats.ok(latencyMs);
        } catch (e) {
          pollStats.err(e);
        }
      })
    )
  );

  printSummary(pollStats.summary());

  // ── Error analysis ────────────────────────────────────────────────────────
  banner('02-STRESS: AGGREGATE SUMMARY');
  const sS = sessionStats.summary();
  const mS = sendStats.summary();
  const pS = pollStats.summary();
  console.log('  Phase          | OK      | Errors  | Error%   | Throughput  | p50       | p95       | p99');
  console.log('  ' + '─'.repeat(95));
  const row = (s) =>
    `  ${s.label.padEnd(30)} | ${String(s.ok).padEnd(7)} | ${String(s.errors).padEnd(7)} | ${s.errorPct.padEnd(8)} | ${s.throughput.padEnd(11)} | ${s.latency.p50.padEnd(9)} | ${s.latency.p95.padEnd(9)} | ${s.latency.p99}`;
  console.log(row(sS));
  console.log(row(mS));
  console.log(row(pS));
  console.log('─'.repeat(60));

  return { test: '02-stress', session: sS, message: mS, poll: pS };
}

if (process.argv[1].endsWith('02-stress.mjs')) {
  const ok = await healthCheck();
  if (ok) await runStressTest();
}
