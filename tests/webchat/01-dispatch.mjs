/**
 * Test 1 — Dispatch / Routing
 *
 * Verifies that 30 concurrent customer sessions are created,
 * messages are successfully queued through the inbound pipeline,
 * and each message can be retrieved via the polling API.
 *
 * What is measured:
 *   • Session creation latency
 *   • Message queue acceptance latency
 *   • Message visibility (appears in GET /messages within 5 s)
 *   • Routing disposition: did an outbound reply appear within 15 s?
 *
 * Run:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/01-dispatch.mjs
 */
import { createSession, sendMessage, fetchMessages, waitForReply, genRef, Pool, Stats, sleep, banner, printSummary, healthCheck } from './lib.mjs';

const SESSIONS      = 30;   // number of concurrent customer sessions
const CONCURRENCY   = 10;   // max parallel in-flight HTTP requests
const REPLY_TIMEOUT = 20_000; // ms to wait for AI/agent reply per session

// Different message intents to trigger different routing paths
const MESSAGES = [
  '你好，我想了解你们的产品',
  '我的订单号是 #12345，怎么查询进度？',
  '我的账号登录不了，需要帮助',
  '我想申请退款',
  '你们的营业时间是几点？',
  '我买的东西还没有到货，已经等了一周了',
  '我想投诉一下你们的服务',
  '你们有什么优惠活动吗？',
  '帮我查一下物流信息',
  '我需要开发票',
];

export async function runDispatchTest() {
  banner('TEST 1 — DISPATCH / ROUTING  (30 sessions × 1 message)');

  const sessionStats = new Stats('01-dispatch: session creation');
  const messageStats = new Stats('01-dispatch: message queue');
  const pollStats    = new Stats('01-dispatch: message visibility');

  const pool = new Pool(CONCURRENCY);
  const results = [];

  // Phase 1: Create sessions + send messages concurrently
  console.log(`  Creating ${SESSIONS} sessions with ${CONCURRENCY} concurrency…`);
  const tasks = Array.from({ length: SESSIONS }, (_, i) => {
    const ref  = genRef('d');
    const text = MESSAGES[i % MESSAGES.length];
    return pool.run(async () => {
      // 1a. Create session
      let session;
      try {
        const { data, latencyMs } = await createSession(ref, `调度测试用户 ${i + 1}`);
        sessionStats.ok(latencyMs);
        session = data;
      } catch (e) {
        sessionStats.err(e);
        return { ref, ok: false, stage: 'session', error: e.message };
      }

      // 1b. Send message
      let sendTs;
      try {
        sendTs = new Date().toISOString();
        const { data, latencyMs } = await sendMessage(ref, text);
        messageStats.ok(latencyMs);
      } catch (e) {
        messageStats.err(e);
        return { ref, ok: false, stage: 'send', error: e.message };
      }

      return { ref, ok: true, sendTs, text, conversationId: session.conversationId };
    });
  });

  const settled = await Promise.allSettled(tasks);
  settled.forEach((r) => results.push(r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message }));

  // Phase 2: Verify messages appear in GET /messages (routing pipeline ran)
  console.log('  Verifying messages were saved (polling each conversation)…');
  const visible = await Promise.allSettled(
    results.filter((r) => r.ok).map((r) =>
      pool.run(async () => {
        await sleep(2_000); // give inbound worker a moment
        const t0 = Date.now();
        try {
          const { data } = await fetchMessages(r.ref, null);
          const found = data.messages?.some((m) => m.direction === 'inbound');
          pollStats.ok(Date.now() - t0);
          return { ref: r.ref, visible: found };
        } catch (e) {
          pollStats.err(e);
          return { ref: r.ref, visible: false };
        }
      })
    )
  );

  const visibleCount = visible.filter((v) => v.status === 'fulfilled' && v.value?.visible).length;

  // Phase 3: Check how many received an outbound reply within timeout
  console.log(`  Waiting up to ${REPLY_TIMEOUT / 1000}s for AI/agent replies…`);
  const replyResults = await Promise.allSettled(
    results.filter((r) => r.ok).map((r) =>
      pool.run(() => waitForReply(r.ref, r.sendTs, REPLY_TIMEOUT))
    )
  );
  const replied = replyResults.filter((r) => r.status === 'fulfilled' && r.value?.found).length;
  const replyWaits = replyResults
    .filter((r) => r.status === 'fulfilled' && r.value?.found)
    .map((r) => r.value.waitMs);
  const avgReplyMs = replyWaits.length
    ? Math.round(replyWaits.reduce((a, b) => a + b, 0) / replyWaits.length)
    : null;

  // Print results
  printSummary(sessionStats.summary());
  printSummary(messageStats.summary());
  printSummary(pollStats.summary());

  banner('01-DISPATCH: ROUTING OUTCOMES');
  console.log(`  Sessions created:          ${results.filter((r) => r.ok).length} / ${SESSIONS}`);
  console.log(`  Messages queued:           ${messageStats.summary().ok} / ${SESSIONS}`);
  console.log(`  Messages visible (poll):   ${visibleCount} / ${results.filter((r) => r.ok).length}`);
  console.log(`  Received outbound reply:   ${replied} / ${results.filter((r) => r.ok).length}`);
  console.log(`  Avg reply wait time:       ${avgReplyMs ? `${avgReplyMs}ms` : 'N/A (no replies)'}`);
  console.log('─'.repeat(60));

  return {
    test: '01-dispatch',
    sessions:   sessionStats.summary(),
    messages:   messageStats.summary(),
    visibility: { visible: visibleCount, total: results.filter((r) => r.ok).length },
    routing:    { replied, total: results.filter((r) => r.ok).length, avgReplyMs },
  };
}

// Run standalone
if (process.argv[1].endsWith('01-dispatch.mjs')) {
  const ok = await healthCheck();
  if (ok) await runDispatchTest();
}
