// Runs every browser-level gate and writes the combined console output to
// test-output/browser-gates.txt so the report can quote it.
//   node tests/browser/run.js            (needs: npm install, npx playwright install chromium)
//
// Thursday: the gates run in parallel lanes (MW_LANES, default 4; 1 is the
// old one-after-another run). Every suite already serves its own copy of
// the app on a free port and opens its own browser, so they never share an
// origin, a profile or a BroadcastChannel; the lanes only share the CPU.
// Each suite runs as its own node process so its output is captured whole
// and printed in the listed order once it finishes, whatever order the
// lanes complete in. Longest suites are started first so the run ends
// about when the longest one does (about two minutes) instead of after the
// sum of all of them (about six).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Locate the Playwright browser cache before any suite starts.
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

// [name, file, typical seconds alone] — the estimate only decides which suites start first.
const suites = [
  ['shell', 'shell.js', 7],
  ['qr-roundtrip', 'qr-roundtrip.js', 1],
  ['offline', 'offline.js', 3],
  ['harness', 'harness.js', 3],
  ['orders', 'orders.js', 6],
  ['match', 'match.js', 66],
  ['spike', 'spike.js', 25],
  ['sonar', 'sonar.js', 37],
  ['soundflag', 'soundflag.js', 20],
  ['transport', 'transport.js', 88],
  ['viewport', 'viewport.js', 117],
  ['soundtrack', 'soundtrack.js', 110],
];

const lanes = Math.max(1, parseInt(process.env.MW_LANES || '4', 10) || 1);
fs.mkdirSync(OUT, { recursive: true });

function runSuite([name, file]) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const chunks = [];
    const child = spawn(process.execPath, [path.join(repoRoot, 'tests', 'browser', file)], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('error', (err) => resolve({ name, ok: false, seconds: (Date.now() - t0) / 1000, output: Buffer.concat(chunks).toString('utf8') + `\n${name}: FAIL — ${err.message}\n` }));
    child.on('close', (code, signal) => {
      const output = Buffer.concat(chunks).toString('utf8');
      const ok = code === 0;
      resolve({ name, ok, seconds: (Date.now() - t0) / 1000, output: ok ? output : output + `\n${name}: FAIL — exit ${code === null ? `signal ${signal}` : code}\n` });
    });
  });
}

// Start longest-first, at most `lanes` at a time; print in listed order.
const queue = suites.slice().sort((a, b) => b[2] - a[2]);
const resolvers = new Map();
const done = new Map(suites.map(([name]) => [name, new Promise((r) => resolvers.set(name, r))]));
let running = 0;
function pump() {
  while (running < lanes && queue.length) {
    const s = queue.shift();
    running += 1;
    runSuite(s).then((r) => { running -= 1; resolvers.get(r.name)(r); pump(); });
  }
}
pump();

const lines = [];
const say = (s) => { lines.push(s); process.stdout.write(s + '\n'); };
say(`browser gates: ${suites.length} suites in ${lanes} lane${lanes === 1 ? '' : 's'}`);
const summary = [];
let failed = 0;
for (const [name] of suites) {
  const r = await done.get(name);
  process.stdout.write(r.output);
  lines.push(r.output.replace(/\n$/, ''));
  if (r.ok) summary.push(`${name}: PASS (${r.seconds.toFixed(1)} s)`);
  else { failed += 1; summary.push(`${name}: FAIL (${r.seconds.toFixed(1)} s) — see above`); }
}
say('\n=== summary ===');
for (const s of summary) say(s);
fs.writeFileSync(path.join(OUT, 'browser-gates.txt'), lines.join('\n') + '\n');
say(`written ${path.join(OUT, 'browser-gates.txt')}`);
process.exit(failed ? 1 : 0);
