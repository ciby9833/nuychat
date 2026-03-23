/**
 * run-all.mjs — Full test suite runner
 *
 * Runs all 7 test files sequentially and writes a consolidated JSON
 * report to tests/webchat/report-<timestamp>.json
 *
 * Usage:
 *   VITE_WEBCHAT_PUBLIC_KEY=wc_alibaba_7d884543ce98 \
 *   VITE_WEBCHAT_API_BASE=http://localhost:3000 \
 *   node tests/webchat/run-all.mjs
 *
 * Options (env vars):
 *   SKIP_TESTS=06        Skip test 06 (e.g. skip the 1000-user test for quick runs)
 *   SKIP_TESTS=04,06     Skip multiple tests
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { healthCheck, banner, CFG } from './lib.mjs';
import { runDispatchTest }   from './01-dispatch.mjs';
import { runStressTest }     from './02-stress.mjs';
import { runReplyTest }      from './03-reply.mjs';
import { runWaitTest }       from './04-wait.mjs';
import { runEndTest }        from './05-end.mjs';
import { runLoadTest }       from './06-load.mjs';
import { runDedupTest }      from './07-dedup.mjs';

const __dir  = dirname(fileURLToPath(import.meta.url));
const skip   = new Set((process.env.SKIP_TESTS ?? '').split(',').map((s) => s.trim()).filter(Boolean));

const SUITE = [
  { id: '01', label: 'Dispatch / Routing',          fn: runDispatchTest },
  { id: '02', label: 'Stress / Performance',         fn: runStressTest },
  { id: '03', label: 'Message Reply Handling',       fn: runReplyTest },
  { id: '04', label: 'Customer Wait Time',           fn: runWaitTest },
  { id: '05', label: 'Conversation End / Lifecycle', fn: runEndTest },
  { id: '06', label: 'Full Load (1000 customers)',   fn: runLoadTest },
  { id: '07', label: 'Dedup / Session Recovery',     fn: runDedupTest },
];

banner('NUYCHAT WEBCHAT TEST SUITE');
console.log(`  API:        ${CFG.apiBase}`);
console.log(`  Public key: ${CFG.publicKey}`);
console.log(`  Tests:      ${SUITE.length} total  |  skip: ${skip.size ? [...skip].join(', ') : 'none'}`);
console.log(`  Time:       ${new Date().toISOString()}`);

const ok = await healthCheck();
if (!ok) {
  console.error('\nAborting: health check failed.\n');
  process.exit(1);
}

const report = {
  meta: { api: CFG.apiBase, publicKey: CFG.publicKey, startedAt: new Date().toISOString() },
  results: {},
};

for (const { id, label, fn } of SUITE) {
  if (skip.has(id)) {
    console.log(`\n  [SKIP] ${id} — ${label}`);
    report.results[id] = { skipped: true };
    continue;
  }
  try {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  RUNNING ${id}: ${label}`);
    console.log('═'.repeat(70));
    report.results[id] = await fn();
  } catch (e) {
    console.error(`\n  ✗ Test ${id} crashed: ${e.message}`);
    report.results[id] = { error: e.message };
  }
}

report.meta.finishedAt = new Date().toISOString();

// Write JSON report
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportPath = join(__dir, `report-${ts}.json`);
await writeFile(reportPath, JSON.stringify(report, null, 2));

// Final summary table
banner('FINAL SUMMARY');
const pass = [], fail = [], skipped = [];
for (const { id, label } of SUITE) {
  const r = report.results[id];
  if (r?.skipped) skipped.push(`  [SKIP] ${id} ${label}`);
  else if (r?.error) fail.push(`  [FAIL] ${id} ${label}: ${r.error}`);
  else pass.push(`  [PASS] ${id} ${label}`);
}
pass.forEach((l) => console.log(l));
skipped.forEach((l) => console.log(l));
fail.forEach((l) => console.log(l));
console.log(`\n  Report written to: ${reportPath}`);
console.log('─'.repeat(60));
