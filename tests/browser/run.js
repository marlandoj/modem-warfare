// Runs every browser-level gate in sequence and writes the combined console
// output to test-output/browser-gates.txt so the report can quote it.
//   node tests/browser/run.js            (needs: npm install, npx playwright install chromium)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Locate the Playwright browser cache before any suite imports playwright.
// Honour an explicit PLAYWRIGHT_BROWSERS_PATH; otherwise use a repo-local
// `.browsers/`, the factory workspace's sibling `_tools/browsers/`, or a
// `browsers/` directory next to the node_modules that actually holds the
// playwright package (node_modules may be a symlink into a shared tool dir,
// as it is in the factory workspace layout); else Playwright's default
// (~/.cache/ms-playwright). Lets the suite run from a bare shell (the
// orchestrator's trusted check) without per-shell setup.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const candidates = [path.join(repoRoot, '.browsers'), path.join(repoRoot, '..', '_tools', 'browsers')];
  try {
    const pwDir = fs.realpathSync(path.join(repoRoot, 'node_modules', 'playwright'));
    candidates.push(path.resolve(pwDir, '..', '..', 'browsers'));
  } catch { /* playwright not installed: the suites will say so */ }
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) process.env.PLAYWRIGHT_BROWSERS_PATH = found;
}
const { OUT } = await import('./lib.js');

const suites = [
  ['shell', () => import('./shell.js')],
  ['qr-roundtrip', () => import('./qr-roundtrip.js')],
  ['offline', () => import('./offline.js')],
  ['harness', () => import('./harness.js')],
  ['match', () => import('./match.js')],
  ['spike', () => import('./spike.js')],
  ['sonar', () => import('./sonar.js')],
  ['soundflag', () => import('./soundflag.js')],
  ['orders', () => import('./orders.js')],
  ['transport', () => import('./transport.js')],
  ['viewport', () => import('./viewport.js')],
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
