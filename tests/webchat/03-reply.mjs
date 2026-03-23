/**
 * Test 3 — Message Reply Handling
 *
 * Creates 40 sessions, each sends one message, then polls until an
 * outbound AI/agent reply appears (or times out after 30 s).
 *
 * Measures:
 *   • First-response time (FRT) — time from message sent → reply visible
 *   • Reply rate — % of sessions that received any reply within timeout
 *   • Reply type breakdown: bot vs agent vs system
 *   • Message content integrity: reply text is non-empty
 *
 * Run:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/03-reply.mjs
 */
import { createSession, sendMessage, waitForReply, genRef, Pool, Stats, sleep, banner, printSummary, healthCheck } from './lib.mjs';

const SESSIONS       = 40;
const CONCURRENCY    = 10;
const REPLY_TIMEOUT  = 30_000;

const TEST_MESSAGES = [
  '你好，请问有人吗？',
  '我想了解一下你们的退货政策',
  '我的快递还没到，能帮我查一下吗？订单 ORD-20260318-8899',
  '你们支持分期付款吗？',
  '产品出现质量问题，我要投诉',
  '你们的客服工作时间是什么时候？',
  '我忘记密码了，怎么找回？',
  '这个产品还有货吗？',
];

export async function runReplyTest() {
  banner(`TEST 3 — MESSAGE REPLY HANDLING  (${SESSIONS} sessions, timeout=${REPLY_TIMEOUT / 1000}s)`);

  const setupStats = new Stats('03-reply: session+send setup');
  const pool = new Pool(CONCURRENCY);

  const jobs = Array.from({ length: SESSIONS }, (_, i) => ({
    ref:  genRef('r'),
    text: TEST_MESSAGES[i % TEST_MESSAGES.length],
  }));

  // Phase 1: create sessions and send messages
  console.log('  Setting up sessions and sending messages…');
  const readyJobs = [];

  await Promise.allSettled(
    jobs.map((job) =>
      pool.run(async () => {
        try {
          await createSession(job.ref, `回复测试用户`);
          const sendTs = new Date().toISOString();
          const { latencyMs } = await sendMessage(job.ref, job.text);
          setupStats.ok(latencyMs);
          readyJobs.push({ ...job, sendTs });
        } catch (e) {
          setupStats.err(e);
        }
      })
    )
  );

  printSummary(setupStats.summary());
  console.log(`  Waiting for replies from ${readyJobs.length} sessions (up to ${REPLY_TIMEOUT / 1000}s each)…`);

  // Phase 2: wait for replies concurrently
  const frtList = [];
  const replyTypes = { bot: 0, agent: 0, system: 0, none: 0 };
  const frtStats = new Stats('03-reply: first response time');

  const replyResults = await Promise.allSettled(
    readyJobs.map((job) =>
      pool.run(() => waitForReply(job.ref, job.sendTs, REPLY_TIMEOUT))
    )
  );

  replyResults.forEach((r, idx) => {
    if (r.status === 'fulfilled') {
      const { found, message, waitMs } = r.value;
      if (found) {
        frtStats.ok(waitMs);
        frtList.push(waitMs);
        const type = message?.sender_type ?? 'unknown';
        replyTypes[type] = (replyTypes[type] ?? 0) + 1;
        // Verify reply content integrity
        const hasText = Boolean(message?.content?.text?.trim());
        if (!hasText && message?.message_type === 'text') {
          console.warn(`  ⚠ Empty text reply from ${type} for session ${readyJobs[idx].ref}`);
        }
      } else {
        replyTypes.none++;
      }
    } else {
      replyTypes.none++;
    }
  });

  // Print FRT stats
  printSummary(frtStats.summary());

  banner('03-REPLY: OUTCOMES');
  const total = readyJobs.length;
  const replied = total - replyTypes.none;
  console.log(`  Total sessions:     ${total}`);
  console.log(`  Received reply:     ${replied} (${((replied / total) * 100).toFixed(1)}%)`);
  console.log(`  Timed out:          ${replyTypes.none}`);
  console.log(`  Reply breakdown:    bot=${replyTypes.bot}  agent=${replyTypes.agent}  system=${replyTypes.system ?? 0}`);
  if (frtList.length) {
    const sorted = [...frtList].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    console.log(`  FRT median:         ${median}ms`);
    console.log(`  FRT fastest:        ${sorted[0]}ms`);
    console.log(`  FRT slowest:        ${sorted[sorted.length - 1]}ms`);
  }
  console.log('─'.repeat(60));

  return {
    test: '03-reply',
    setup: setupStats.summary(),
    frt: frtStats.summary(),
    replied,
    total,
    replyTypes,
  };
}

if (process.argv[1].endsWith('03-reply.mjs')) {
  const ok = await healthCheck();
  if (ok) await runReplyTest();
}
