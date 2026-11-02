// Runs every browser-level gate in sequence and writes the combined console
// output to test-output/browser-gates.txt so the report can quote it.
//   node tests/browser/run.js            (needs: npm install, npx playwright install chromium)
import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.js';

const suites = [
  ['shell', () => import('./shell.js')],
  ['qr-roundtrip', () => import('./qr-roundtrip.js')],
  ['offline', () => import('./offline.js')],
  ['harness', () => import('./harness.js')],
  ['spike', () => import('./spike.js')],
];

const lines = [];
const origLog = console.log;
console.log = (...args) => { const s = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); lines.push(s); origLog(s); };

const summary = [];
let failed = 0;
for (const [name, load] of suites) {
  const t0 = Date.now();
  try {
    const mod = await load();
    await mod.run();
    summary.push(`${name}: PASS (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failed += 1;
    summary.push(`${name}: FAIL — ${err.message}`);
    console.log(`${name}: FAIL — ${err.stack || err.message}`);
  }
}
console.log('\n=== summary ===');
for (const s of summary) console.log(s);
fs.writeFileSync(path.join(OUT, 'browser-gates.txt'), lines.join('\n') + '\n');
console.log(`written ${path.join(OUT, 'browser-gates.txt')}`);
process.exit(failed ? 1 : 0);
