// Dev harness: two app instances in one page exchange a handshake frame and a
// salvo frame over BroadcastChannel using the production codec, with no
// console or page errors in either instance.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

export async function run() {
  banner('harness: handshake + salvo over BroadcastChannel');
  const srv = await startServer();
  const { context, close } = await launch();
  const page = await context.newPage();
  const cap = capture(page, 'harness');
  try {
    await page.goto(`${srv.base}/dev/harness.html`);
    await page.waitForFunction(() => window.harness && document.querySelectorAll('iframe').length === 2);
    const summary = await page.evaluate(() => window.harness.runScript());
    console.log('session:', summary.session);
    console.log('A received:', summary.aIncoming);
    console.log('B received:', summary.bIncoming);
    console.log('A gate log:', JSON.stringify(summary.aGate));
    console.log('B gate log:', JSON.stringify(summary.bGate));
    const lines = await page.evaluate(() => window.harness.lines.map((l) => l.text));
    console.log('channel log:\n  ' + lines.join('\n  '));
    assert(summary.errors.length === 0, 'no errors inside instances: ' + summary.errors.join(' | '));
    assert(/^SALVO .* salvo A1 B2 C3 · results/.test(summary.aIncoming), 'A holds B\'s salvo with results');
    assert(/^SALVO .* salvo C4 E2 G7 · results/.test(summary.bIncoming), 'B holds A\'s salvo with results');
    const aAccepted = summary.aGate.filter((l) => l.status === 'accepted').map((l) => l.type);
    const bAccepted = summary.bGate.filter((l) => l.status === 'accepted').map((l) => l.type);
    assert(aAccepted[0] === 'HANDSHAKE' && aAccepted.includes('SALVO'), 'A accepted handshake then salvo: ' + aAccepted);
    assert(bAccepted[0] === 'HANDSHAKE' && bAccepted.includes('SALVO'), 'B accepted handshake then salvo: ' + bAccepted);
    assert(!summary.aGate.some((l) => l.status === 'rejected') && !summary.bGate.some((l) => l.status === 'rejected'), 'no rejected frames during a clean exchange');
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.screenshot({ path: path.join(OUT, 'harness.png') });
    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('harness: PASS');
    return { ok: true, summary, lines };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('harness.js')) run().catch((e) => { console.error(e); process.exit(1); });
