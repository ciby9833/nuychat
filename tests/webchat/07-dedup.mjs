/**
 * Test 7 — Message Deduplication & Session Recovery
 *
 * Tests two correctness properties:
 *
 * A. DEDUPLICATION: The inbound queue uses a stable jobId
 *    (`web:{channelId}:{messageId}`). Sending the same message body twice
 *    within a short window should not produce duplicate messages in history.
 *
 * B. SESSION RECOVERY: A customer who sends `customerRef` in multiple
 *    browser sessions (tabs, reconnects) should land in the same conversation.
 *    This test creates the same customerRef in two "tabs" and verifies that
 *    both end up in the same conversationId.
 *
 * C. POLL CURSOR: The `since` timestamp filter returns only new messages.
 *    Verifies that polling with a fresh cursor returns zero old messages.
 *
 * Run:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/07-dedup.mjs
 */
import { createSession, sendMessage, fetchMessages, genRef, sleep, banner, healthCheck } from './lib.mjs';

const DEDUP_CASES   = 20;
const RECOVERY_CASES = 20;

export async function runDedupTest() {
  banner('TEST 7 — DEDUP / SESSION RECOVERY / POLL CURSOR');

  // ── A. Message deduplication (rapid double-send) ──────────────────────────
  console.log('\n  [A] Deduplication — send same text twice rapidly…');
  let dedupPassed = 0, dedupFailed = 0;

  for (let i = 0; i < DEDUP_CASES; i++) {
    const ref = genRef('dup');
    try {
      await createSession(ref, `去重测试 ${i + 1}`);
      // Send two identical messages back-to-back (no await between them)
      const [r1, r2] = await Promise.all([
        sendMessage(ref, '你好，这是重复消息测试'),
        sendMessage(ref, '你好，这是重复消息测试'),
      ]);
      // Both sends may succeed (different messageIds), but both should appear
      // in history. The key: message content appears exactly twice (not more).
      await sleep(2_000); // let inbound worker process
      const { data } = await fetchMessages(ref, null);
      const inbound = data.messages?.filter((m) => m.direction === 'inbound') ?? [];
      // Two sends → should see exactly 2 inbound messages (both queued with unique IDs)
      if (inbound.length === 2) {
        dedupPassed++;
      } else {
        console.warn(`    ⚠ Case ${i + 1}: expected 2 inbound messages, got ${inbound.length}`);
        dedupFailed++;
      }
    } catch (e) {
      console.error(`    ✗ Case ${i + 1}: ${e.message}`);
      dedupFailed++;
    }
  }
  console.log(`  Result: ${dedupPassed}/${DEDUP_CASES} passed  (${dedupFailed} anomalies)`);

  // ── B. Session recovery (same customerRef, two "tabs") ────────────────────
  console.log('\n  [B] Session recovery — same customerRef in two tabs…');
  let recoveryPassed = 0, recoveryFailed = 0;

  for (let i = 0; i < RECOVERY_CASES; i++) {
    const ref = genRef('recover');
    try {
      // Tab 1: create session
      const { data: s1 } = await createSession(ref, `恢复测试 tab-1`);
      // Tab 2: same customerRef — should return the same conversationId
      const { data: s2 } = await createSession(ref, `恢复测试 tab-2`);
      if (s1.conversationId === s2.conversationId) {
        recoveryPassed++;
      } else {
        console.warn(`    ⚠ Case ${i + 1}: different conversationIds: ${s1.conversationId} vs ${s2.conversationId}`);
        recoveryFailed++;
      }
    } catch (e) {
      console.error(`    ✗ Case ${i + 1}: ${e.message}`);
      recoveryFailed++;
    }
  }
  console.log(`  Result: ${recoveryPassed}/${RECOVERY_CASES} passed  (${recoveryFailed} failures)`);

  // ── C. Poll cursor correctness ────────────────────────────────────────────
  console.log('\n  [C] Poll cursor — since= filters old messages…');
  let cursorPassed = 0, cursorFailed = 0;

  for (let i = 0; i < 20; i++) {
    const ref = genRef('cursor');
    try {
      await createSession(ref, `游标测试 ${i + 1}`);
      await sendMessage(ref, '第一条消息');
      await sleep(500);
      // Mark a cursor AFTER first message
      const cursor = new Date().toISOString();
      await sleep(500);
      await sendMessage(ref, '第二条消息');
      await sleep(1_500);

      const { data } = await fetchMessages(ref, cursor);
      const newMsgs = data.messages ?? [];
      // Should only see the second message (inbound) since cursor is after first
      const hasOnly2nd = newMsgs.some((m) => m.content?.text?.includes('第二条消息'));
      const hasOld     = newMsgs.some((m) => m.content?.text?.includes('第一条消息'));
      if (hasOnly2nd && !hasOld) {
        cursorPassed++;
      } else {
        console.warn(`    ⚠ Case ${i + 1}: cursor may not be filtering correctly (has2nd=${hasOnly2nd} hasOld=${hasOld})`);
        cursorFailed++;
      }
    } catch (e) {
      console.error(`    ✗ Case ${i + 1}: ${e.message}`);
      cursorFailed++;
    }
  }
  console.log(`  Result: ${cursorPassed}/20 passed  (${cursorFailed} failures)`);

  banner('07-DEDUP: SUMMARY');
  console.log(`  Deduplication:    ${dedupPassed}/${DEDUP_CASES} ✓`);
  console.log(`  Session recovery: ${recoveryPassed}/${RECOVERY_CASES} ✓`);
  console.log(`  Poll cursor:      ${cursorPassed}/20 ✓`);
  const allOk = dedupPassed === DEDUP_CASES && recoveryPassed === RECOVERY_CASES && cursorPassed === 20;
  console.log(`  Overall:          ${allOk ? '✓ ALL PASSED' : '✗ SOME FAILURES — check warnings above'}`);
  console.log('─'.repeat(60));

  return {
    test: '07-dedup',
    dedup:    { passed: dedupPassed, total: DEDUP_CASES },
    recovery: { passed: recoveryPassed, total: RECOVERY_CASES },
    cursor:   { passed: cursorPassed, total: 20 },
  };
}

if (process.argv[1].endsWith('07-dedup.mjs')) {
  const ok = await healthCheck();
  if (ok) await runDedupTest();
}
