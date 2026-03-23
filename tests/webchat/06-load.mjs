/**
 * Test 6 — Full Load: 1000 Customers
 *
 * Simulates 1000 unique customers, each creating a session and sending
 * one message. Executed in waves of 50 concurrent requests.
 *
 * This is a pure throughput + error rate test. No waiting for replies
 * (that is covered by test 3 and 4). Goal: verify the API survives
 * sustained load without degrading or throwing errors.
 *
 * Output:
 *   • Per-wave error rate (detect degradation over time)
 *   • Overall p50/p95/p99 latencies for session creation and message send
 *   • Total duration and throughput
 *   • Error breakdown by HTTP status code
 *
 * Run (takes ~3–8 minutes):
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/06-load.mjs
 */
import { createSession, sendMessage, genRef, Pool, Stats, sleep, banner, printSummary, healthCheck } from './lib.mjs';

const TOTAL_CUSTOMERS = 1_000;
const WAVE_SIZE       = 50;    // concurrent requests per wave
const WAVE_PAUSE_MS   = 200;   // brief pause between waves to avoid thundering herd

export async function runLoadTest() {
  banner(`TEST 6 — FULL LOAD: ${TOTAL_CUSTOMERS} CUSTOMERS  (waves of ${WAVE_SIZE})`);

  const sessionStats = new Stats(`06-load: session creation (n=${TOTAL_CUSTOMERS})`);
  const sendStats    = new Stats(`06-load: message send (n=${TOTAL_CUSTOMERS})`);

  const pool = new Pool(WAVE_SIZE);

  // Track per-wave error rates to detect degradation
  const waves = Math.ceil(TOTAL_CUSTOMERS / WAVE_SIZE);
  const waveStats = [];

  let processed = 0;
  const startMs = Date.now();

  for (let wave = 0; wave < waves; wave++) {
    const waveStart = wave * WAVE_SIZE;
    const waveEnd   = Math.min(waveStart + WAVE_SIZE, TOTAL_CUSTOMERS);
    const waveSize  = waveEnd - waveStart;

    let waveOk = 0, waveErr = 0;

    await Promise.allSettled(
      Array.from({ length: waveSize }, (_, j) => {
        const idx = waveStart + j;
        const ref = genRef('l');
        return pool.run(async () => {
          // Step 1: create session
          let sessionOk = false;
          try {
            const { latencyMs } = await createSession(ref, `负载测试用户 ${idx + 1}`);
            sessionStats.ok(latencyMs);
            sessionOk = true;
          } catch (e) {
            sessionStats.err(e);
            waveErr++;
            return;
          }

          // Step 2: send message
          if (sessionOk) {
            try {
              const { latencyMs } = await sendMessage(ref, `你好，这是第 ${idx + 1} 位客户的测试消息`);
              sendStats.ok(latencyMs);
              waveOk++;
            } catch (e) {
              sendStats.err(e);
              waveErr++;
            }
          }
        });
      })
    );

    processed += waveSize;
    waveStats.push({ wave: wave + 1, ok: waveOk, err: waveErr });

    // Progress report every 5 waves
    if ((wave + 1) % 5 === 0 || wave === waves - 1) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      const rate    = (processed / (Date.now() - startMs) * 1000).toFixed(1);
      console.log(`  [wave ${wave + 1}/${waves}] processed=${processed}/${TOTAL_CUSTOMERS}  rate=${rate}/s  elapsed=${elapsed}s  waveErr=${waveErr}`);
    }

    if (WAVE_PAUSE_MS > 0 && wave < waves - 1) await sleep(WAVE_PAUSE_MS);
  }

  printSummary(sessionStats.summary());
  printSummary(sendStats.summary());

  // Wave degradation analysis
  banner('06-LOAD: WAVE DEGRADATION ANALYSIS');
  const firstHalfWaves = waveStats.slice(0, Math.floor(waves / 2));
  const lastHalfWaves  = waveStats.slice(Math.floor(waves / 2));
  const waveErrRate = (arr) =>
    arr.length ? ((arr.reduce((s, w) => s + w.err, 0) / arr.reduce((s, w) => s + w.ok + w.err, 0)) * 100).toFixed(2) + '%' : 'N/A';

  console.log(`  Total customers:       ${TOTAL_CUSTOMERS}`);
  console.log(`  Total waves:           ${waves}`);
  console.log(`  Session success:       ${sessionStats.summary().ok}`);
  console.log(`  Message success:       ${sendStats.summary().ok}`);
  console.log(`  Overall error rate:    ${sessionStats.summary().errorPct} (sessions)  ${sendStats.summary().errorPct} (messages)`);
  console.log(`  Error rate first half: ${waveErrRate(firstHalfWaves)} of waves`);
  console.log(`  Error rate last half:  ${waveErrRate(lastHalfWaves)} of waves`);

  // Error breakdown by status code
  const statusMap = {};
  [...sessionStats.errors, ...sendStats.errors].forEach((e) => {
    const code = e.status ?? 'network';
    statusMap[code] = (statusMap[code] ?? 0) + 1;
  });
  if (Object.keys(statusMap).length) {
    console.log('  Error codes:');
    Object.entries(statusMap).sort(([, a], [, b]) => b - a).forEach(([code, count]) =>
      console.log(`    HTTP ${code}: ${count} times`)
    );
  }

  console.log(`  Total wall time:       ${((Date.now() - startMs) / 1000).toFixed(1)}s`);
  console.log('─'.repeat(60));

  return {
    test: '06-load',
    session: sessionStats.summary(),
    message: sendStats.summary(),
    waveStats,
    errorCodes: statusMap,
  };
}

if (process.argv[1].endsWith('06-load.mjs')) {
  const ok = await healthCheck();
  if (ok) await runLoadTest();
}
