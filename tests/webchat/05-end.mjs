/**
 * Test 5 — Conversation End / Session Lifecycle
 *
 * Tests the full lifecycle of 20 conversations:
 *   1. Start session
 *   2. Exchange 3 messages (send + wait for reply each turn)
 *   3. After the 3rd reply, verify the conversation history is complete
 *   4. Attempt to send a message after session is "done" — checks if the
 *      channel still accepts further messages (follow-up scenario)
 *
 * Measures:
 *   • Full conversation duration (session create → last reply received)
 *   • Per-turn response time
 *   • Message ordering integrity (messages appear in correct order)
 *   • Follow-up send: can a 4th message be sent after the "end"?
 *
 * Note: The webchat API is stateless on the customer side — there is no
 * explicit "end session" call. Resolution happens on the agent/admin side.
 * This test therefore validates the complete message exchange lifecycle.
 *
 * Run:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/05-end.mjs
 */
import { createSession, sendMessage, waitForReply, fetchMessages, genRef, Pool, Stats, sleep, banner, printSummary, healthCheck } from './lib.mjs';

const SESSIONS     = 20;
const CONCURRENCY  = 5;   // low: each job is long-running (3 turns × 30s)
const TURN_TIMEOUT = 25_000;

const TURNS = [
  '你好，我想了解一下你们的服务',
  '好的，那我想具体询问一下退款流程',
  '明白了，谢谢你的解答！',
];
const FOLLOWUP = '对了，我还想追问一个问题';

export async function runEndTest() {
  banner(`TEST 5 — CONVERSATION LIFECYCLE  (${SESSIONS} sessions × ${TURNS.length} turns)`);

  const pool = new Pool(CONCURRENCY);
  const turnStats = [
    new Stats('05-end: turn-1 FRT'),
    new Stats('05-end: turn-2 FRT'),
    new Stats('05-end: turn-3 FRT'),
  ];
  const lifecycleStats = new Stats('05-end: full conversation duration');
  const followupStats  = new Stats('05-end: follow-up send latency');

  let orderViolations = 0;
  let followupOk = 0;

  const results = await Promise.allSettled(
    Array.from({ length: SESSIONS }, (_, i) => {
      const ref = genRef('e');
      return pool.run(async () => {
        const sessionStart = Date.now();
        const turnResults = [];

        // Create session
        try {
          await createSession(ref, `结束测试 ${i + 1}`);
        } catch (e) {
          return { ref, ok: false, error: e.message, stage: 'session' };
        }

        // 3 turns
        for (let t = 0; t < TURNS.length; t++) {
          try {
            const sendTs = new Date().toISOString();
            await sendMessage(ref, TURNS[t]);
            const reply = await waitForReply(ref, sendTs, TURN_TIMEOUT);
            if (reply.found) {
              turnStats[t].ok(reply.waitMs);
              turnResults.push({ turn: t + 1, waitMs: reply.waitMs, found: true });
            } else {
              turnStats[t].err(new Error('timeout'));
              turnResults.push({ turn: t + 1, waitMs: TURN_TIMEOUT, found: false });
              break; // no point continuing if AI stopped responding
            }
          } catch (e) {
            turnStats[t].err(e);
            break;
          }
        }

        // Record total conversation duration
        lifecycleStats.ok(Date.now() - sessionStart);

        // Message ordering check: fetch all messages and verify timestamps are ascending
        try {
          const { data } = await fetchMessages(ref, null);
          const msgs = data.messages ?? [];
          for (let m = 1; m < msgs.length; m++) {
            if (msgs[m].created_at < msgs[m - 1].created_at) {
              orderViolations++;
              break;
            }
          }
        } catch { /* ignore */ }

        // Follow-up send: can the customer send again after the conversation?
        try {
          const { latencyMs } = await sendMessage(ref, FOLLOWUP);
          followupStats.ok(latencyMs);
          followupOk++;
        } catch (e) {
          followupStats.err(e);
        }

        return { ref, ok: true, turns: turnResults };
      });
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value?.ok);
  const allTurns = succeeded.flatMap((r) => r.value.turns ?? []);
  const allCompleted = succeeded.filter((r) =>
    r.value.turns?.length === TURNS.length && r.value.turns.every((t) => t.found)
  ).length;

  TURNS.forEach((_, i) => printSummary(turnStats[i].summary()));
  printSummary(lifecycleStats.summary());
  printSummary(followupStats.summary());

  banner('05-END: LIFECYCLE OUTCOMES');
  console.log(`  Sessions started:             ${SESSIONS}`);
  console.log(`  Fully completed (${TURNS.length} turns):   ${allCompleted} / ${SESSIONS}`);
  console.log(`  Message order violations:     ${orderViolations}`);
  console.log(`  Follow-up send success:       ${followupOk} / ${SESSIONS}`);
  const avgDuration = lifecycleStats.latencies.length
    ? Math.round(lifecycleStats.latencies.reduce((a, b) => a + b, 0) / lifecycleStats.latencies.length)
    : 0;
  console.log(`  Avg full conversation time:   ${avgDuration}ms`);
  console.log('─'.repeat(60));

  return {
    test: '05-end',
    turns: TURNS.map((_, i) => turnStats[i].summary()),
    lifecycle: lifecycleStats.summary(),
    followup: followupStats.summary(),
    allCompleted,
    orderViolations,
    followupOk,
  };
}

if (process.argv[1].endsWith('05-end.mjs')) {
  const ok = await healthCheck();
  if (ok) await runEndTest();
}
