// Wednesday gate: Sealed Orders through the two-window harness.
//   compose on A (an over-limit note is refused first, message visible, text
//   untouched) -> ONE static QR -> the card crosses to B as the camera would
//   -> kept in B's localStorage -> mark an item done -> B reloads and still
//   has it -> pass it on renders hop 2. Plus: the card QR decodes from pixels
//   through the app's decoder (zxing-wasm here), including the largest card
//   the limits allow, and the claims discipline over the whole screen's copy.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

export async function run() {
  banner('orders: Sealed Orders compose / scan-to-keep / done / reload / pass it on');
  const srv = await startServer();
  const { context, close } = await launch();
  const page = await context.newPage();
  const cap = capture(page, 'orders');
  try {
    await page.goto(`${srv.base}/dev/harness.html`);
    await page.waitForFunction(() => window.harness && window.harness.runOrders && document.querySelectorAll('iframe').length === 2);
    await page.setViewportSize({ width: 1400, height: 1100 });
    const s = await page.evaluate(() => window.harness.runOrders());
    console.log('refused:', JSON.stringify(s.refused));
    console.log('composed:', JSON.stringify({ ...s.composed, text: s.composed.text.slice(0, 60) + '…' }));
    console.log('received on B:', JSON.stringify(s.received));
    console.log('after reload on B:', JSON.stringify(s.afterReload));
    console.log('passed on from B:', JSON.stringify(s.passedOn));
    await page.screenshot({ path: path.join(OUT, 'orders-harness.png') });

    assert(s.errors.length === 0, 'no errors inside instances: ' + s.errors.join(' | '));
    assert(/NOTE TOO LONG · 701 OF 700 CHARACTERS · TRIM 1/.test(s.refused.message), 'over-limit note refused with the count and limit: ' + s.refused.message);
    assert(s.refused.visible && s.refused.view === 'compose' && s.refused.kept === 0, 'refusal is visible, stays on the form, keeps nothing');
    assert(s.refused.noteStillLong, 'the note was not truncated');
    assert(/^701 \/ 700$/.test(s.refused.counter), 'the live counter shows 701 / 700: ' + s.refused.counter);
    assert(s.composed.hop === 1 && s.composed.hopLine === 'HOP 1', 'a fresh card is hop 1');
    assert(s.composed.qrVersion >= 5 && s.composed.qrVersion <= 30, `card renders as one static QR v${s.composed.qrVersion}`);
    assert(s.received.id === s.composed.id && s.received.hop === 1 && s.received.stored && s.received.from === 'broadcast', 'B kept the card in localStorage from the scan path');
    assert(s.received.items.length === 3 && /Jordan/.test(s.received.note), 'note and checklist arrived intact');
    assert(/CARD KEPT ✓/.test(s.received.contact), 'B\'s contact line says kept');
    assert(JSON.stringify(s.afterReload.done) === '[false,true,false]' && JSON.stringify(s.afterReload.checkedBoxes) === '[false,true,false]', 'mark-as-done persisted across the reload');
    assert(s.afterReload.hop === 1 && s.afterReload.hopLine === 'HOP 1', 'hop unchanged by the reload');
    assert(s.passedOn.hop === 2 && s.passedOn.hopLine === 'HOP 2' && /HOP 2/.test(s.passedOn.caption), 'pass it on re-renders the card at hop 2');
    assert(JSON.stringify(s.passedOn.doneCarried) === '[false,true,false]', 'done marks travel with the card');

    // Pixel round-trip of the card QR through the app's decoder, plus the largest allowed card.
    // (Evaluated inside instance A's frame: the app CSP has no 'unsafe-eval', so modules are imported, never eval'd.)
    const frameA = page.frames().find((f) => /dev=A/.test(f.url()));
    const px = await frameA.evaluate(async () => {
      const Q = await import('./js/qr.js');
      const O = await import('./js/orders.js');
      await Q.prepareDecoder();
      const cases = {
        current: document.querySelector('#qr-card').dataset.text,
        biggest: O.cardToText({ id: 'cafe0001', hop: 7, label: 'SCHOOL RUN', note: 'Lé note ☕ '.padEnd(O.NOTE_MAX, 'z'), items: Array.from({ length: O.ITEMS_MAX }, (_, i) => ({ text: `item ${i + 1} `.padEnd(O.ITEM_MAX, 'y'), done: i % 2 === 0 })) }),
      };
      const out = {};
      for (const [name, text] of Object.entries(cases)) {
        const canvas = document.createElement('canvas');
        const { version, modules, size } = Q.qrToCanvas(text, canvas, { scale: 4, minVersion: 5, maxVersion: O.CARD_QR_MAX_VERSION, mode: 'Byte' });
        const t0 = performance.now();
        const got = await Q.decodeImage(canvas.getContext('2d').getImageData(0, 0, size, size));
        out[name] = { version, modules, bytes: O.utf8Length(text), ms: Math.round(performance.now() - t0), roundTrip: got === text, decoder: Q.activeDecoder(), hop: got ? O.textToCard(got).hop : null };
      }
      return out;
    });
    console.log('card QR pixel round-trip:', JSON.stringify(px));
    assert(px.current.roundTrip, 'the composed card decodes from pixels to the identical text');
    assert(px.biggest.roundTrip && px.biggest.hop === 7, `the largest allowed card (${px.biggest.bytes} bytes, QR v${px.biggest.version}) decodes from pixels`);

    // Claims discipline over every view of the Sealed Orders screen (hidden ones included).
    const copy = await frameA.evaluate(() => {
      const sec = document.querySelector('#screen-sealed');
      const text = [sec.textContent, ...Array.from(sec.querySelectorAll('[title],[aria-label],[placeholder]')).map((e) => [e.getAttribute('title'), e.getAttribute('aria-label'), e.getAttribute('placeholder')].filter(Boolean).join(' '))].join(' ');
      return text.replace(/\s+/g, ' ');
    });
    const residue = copy.replace(/NOT SECRET/gi, '');
    assert(/LOCAL, NOT SECRET/.test(copy), 'the standing label "LOCAL, NOT SECRET" is on the screen');
    assert(!/\bSECRET\b|\bSECURE\b|\bSECURELY\b|\bENCRYPTED\b|\bENCRYPTION\b/i.test(residue), 'no secret / secure / encrypted in the Sealed Orders copy outside the standing label');
    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('orders: PASS (refused over-limit; composed v' + s.composed.qrVersion + '; kept on B; done persisted across reload; hop 2 on pass-on; pixels decode)');
    return { ok: true, summary: s, px };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('orders.js')) run().catch((e) => { console.error(e); process.exit(1); });
