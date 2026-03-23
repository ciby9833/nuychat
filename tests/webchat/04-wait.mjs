/**
 * Test 4 — Customer Wait Time
 *
 * Simulates a burst of 80 customers all arriving simultaneously, measuring
 * how long each waits before receiving a first response. This tests the
 * routing queue under concurrent inbound pressure.
 *
 * Additionally sends a second message per customer to test multi-turn
 * conversation wait times vs. single-turn FRT.
 *
 * Metrics:
 *   • Time-to-first-response (TTFR) distribution under queue pressure
 *   • Impact of burst size on wait time (compare first 20 vs. last 20 sessions)
 *   • Second-message response wait time
 *   • Queue saturation: % sessions that timed out without a reply
 *
 * Run:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/04-wait.mjs
 */
import { createSession, sendMessage, waitForReply, fetchMessages, genRef, Pool, Stats, sleep, banner, printSummary, healthCheck } from './lib.mjs';

const BURST_SIZE    = 80;   // all arrive at once (pool caps actual HTTP concurrency)
const CONCURRENCY   = 40;   // HTTP concurrency
const TTFR_TIMEOUT  = 45_000;

export async function runWaitTest() {
  banner(`TEST 4 — CUSTOMER WAIT TIME  (${BURST_SIZE} simultaneous arrivals)`);

  const pool = new Pool(CONCURRENCY);
  const sessions = Array.from({ length: BURST_SIZE }, (_, i) => ({
    ref: genRef('w'),
    idx: i,
  }));

  // ── Phase 1: All sessions start at the same moment ────────────────────────
  console.log(`  Launching all ${BURST_SIZE} sessions simultaneously…`);
  const burstStart = Date.now();
  const initStats = new Stats('04-wait: session init (burst)');

  await Promise.allSettled(
    sessions.map((s) =>
      pool.run(async () => {
        try {
          const { latencyMs } = await createSession(s.ref, `等待测试 ${s.idx + 1}`);
          initStats.ok(latencyMs);
        } catch (e) {
          initStats.err(e);
          s.failed = true;
        }
      })
    )
  );
  console.log(`  All ${BURST_SIZE} sessions created in ${((Date.now() - burstStart) / 1000).toFixed(1)}s`);
  printSummary(initStats.summary());

  // ── Phase 2: All send first message at same time ──────────────────────────
  console.log('  Sending first message from all sessions simultaneously…');
  const sendStats1 = new Stats('04-wait: first message send');
  const sendStart = Date.now();

  await Promise.allSettled(
    sessions.filter((s) => !s.failed).map((s) =>
      pool.run(async () => {
        try {
          s.sendTs1 = new Date().toISOString();
          const { latencyMs } = await sendMessage(s.ref, `你好，我是第 ${s.idx + 1} 位客户，需要查询我的订单状态`);
          sendStats1.ok(latencyMs);
          s.sent1 = true;
        } catch (e) {
          sendStats1.err(e);
        }
      })
    )
  );
  console.log(`  All first messages sent in ${((Date.now() - sendStart) / 1000).toFixed(1)}s`);
  printSummary(sendStats1.summary());

  // ── Phase 3: Wait for first replies ───────────────────────────────────────
  console.log(`  Waiting up to ${TTFR_TIMEOUT / 1000}s for first replies…`);
  const readySessions = sessions.filter((s) => s.sent1);
  const replyStats1 = new Stats('04-wait: first reply wait time');

  const reply1Results = await Promise.allSettled(
    readySessions.map((s) =>
      pool.run(() => waitForReply(s.ref, s.sendTs1, TTFR_TIMEOUT))
    )
  );

  const ttfrList = [];
  let replied1 = 0;

  reply1Results.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value.found) {
      replyStats1.ok(r.value.waitMs);
      ttfrList.push({ idx: readySessions[idx].idx, ms: r.value.waitMs });
      readySessions[idx].replied1 = true;
      replied1++;
    } else {
      replyStats1.err(new Error('timeout'));
    }
  });

  printSummary(replyStats1.summary());

  // ── Phase 4: Second message (multi-turn test) ─────────────────────────────
  const secondTurnSessions = readySessions.filter((s) => s.replied1).slice(0, 30);
  console.log(`  Sending second message from ${secondTurnSessions.length} sessions (multi-turn)…`);
  const replyStats2 = new Stats('04-wait: second reply wait time');

  await Promise.allSettled(
    secondTurnSessions.map((s) =>
      pool.run(async () => {
        try {
          s.sendTs2 = new Date().toISOString();
          await sendMessage(s.ref, '谢谢，我还有一个问题，你们的退货期限是多久？');
          const result = await waitForReply(s.ref, s.sendTs2, TTFR_TIMEOUT);
          if (result.found) replyStats2.ok(result.waitMs);
          else replyStats2.err(new Error('timeout'));
        } catch (e) {
          replyStats2.err(e);
        }
      })
    )
  );

  printSummary(replyStats2.summary());

  // ── Wait time analysis ────────────────────────────────────────────────────
  banner('04-WAIT: QUEUE PRESSURE ANALYSIS');
  const sorted = [...ttfrList].sort((a, b) => a.ms - b.ms);

  // Compare early vs late arrivals
  const earlyGroup = ttfrList.filter((x) => x.idx < BURST_SIZE / 2);
  const lateGroup  = ttfrList.filter((x) => x.idx >= BURST_SIZE / 2);
  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, x) => s + x.ms, 0) / arr.length) : 0;

  console.log(`  Total sessions:              ${BURST_SIZE}`);
  console.log(`  Got first reply (turn 1):    ${replied1} / ${readySessions.length} (${((replied1 / readySessions.length) * 100).toFixed(1)}%)`);
  console.log(`  Timed out:                   ${readySessions.length - replied1}`);
  if (ttfrList.length) {
    console.log(`  TTFR fastest:                ${sorted[0].ms}ms`);
    console.log(`  TTFR slowest:                ${sorted[sorted.length - 1].ms}ms`);
    console.log(`  Early arrivals avg TTFR:     ${avg(earlyGroup)}ms  (first ${BURST_SIZE / 2} sessions)`);
    console.log(`  Late arrivals avg TTFR:      ${avg(lateGroup)}ms   (last ${BURST_SIZE / 2} sessions)`);
    console.log(`  Queue pressure delta:        ${avg(lateGroup) - avg(earlyGroup)}ms (late minus early)`);
  }
  console.log('─'.repeat(60));

  return {
    test: '04-wait',
    init: initStats.summary(),
    firstSend: sendStats1.summary(),
    firstReply: replyStats1.summary(),
    secondReply: replyStats2.summary(),
    replied1,
    burstSize: BURST_SIZE,
  };
}

if (process.argv[1].endsWith('04-wait.mjs')) {
  const ok = await healthCheck();
  if (ok) await runWaitTest();
}
