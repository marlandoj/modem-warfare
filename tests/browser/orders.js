// REMOVAL gate (browser): the shipped app has no path to Sealed Orders.
//   Until the SHIP build this gate drove the card through the two-window
//   harness. The operator ruled on 2026-11-02 that the feature leaves the
//   entry, so the gate now proves the removal at runtime, on the app as a
//   phone would load it:
//   - a phone that still holds Wednesday's cards under the feature's storage
//     key boots the new app, and that key is never read, written or removed
//     (no migration, no cleanup: the data is simply never looked at again);
//   - Home shows no entry point, the shell has the five match screens only,
//     the old route falls back to Home, the debug surface exposes nothing of
//     the feature, and no word of its vocabulary is in the document;
//   - the server has no orders module, the service worker cached none, and
//     nothing loaded by the page names one;
//   - an old card text presented to the receive gate (as a stale scan would
//     be) is rejected like any foreign text, with no error.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

const STORE_KEY = 'mw.orders.v1';
const VOCAB = /sealed|orders|household/i;
// A card as the Wednesday build kept it, and as its QR carried it.
const OLD_CARDS = JSON.stringify([{ id: 'cafe0001', hop: 2, label: 'KITCHEN', note: 'Bins go out Tuesday night.', items: [{ text: 'Feed the cat', done: true }] }]);
const OLD_CARD_TEXT = 'MWO1{"id":"cafe0001","hop":2,"label":"KITCHEN","note":"Bins go out Tuesday night.","items":[{"text":"Feed the cat","done":true}]}';

export async function run() {
  banner('orders: removed — no entry point, no screen, no module, the old store key never read');
  const srv = await startServer();
  const { context, close } = await launch();
  // Seed the feature's store as a phone would still have it, then record every
  // storage key the app touches from the first script on.
  await context.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
    const touched = [];
    window.__storageTouched = touched;
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      const orig = Storage.prototype[method];
      Storage.prototype[method] = function (k, ...rest) { touched.push(`${method}:${k}`); return orig.call(this, k, ...rest); };
    }
    const origClear = Storage.prototype.clear;
    Storage.prototype.clear = function () { touched.push('clear'); return origClear.call(this); };
  }, [STORE_KEY, OLD_CARDS]);
  const page = await context.newPage();
  const cap = capture(page, 'orders');
  try {
    await page.goto(`${srv.base}/app/`);
    await page.waitForFunction(() => document.querySelector('#offline-badge').dataset.state === 'ready', null, { timeout: 20000 });
    const home = await page.evaluate(() => ({
      screen: document.body.dataset.screen,
      badge: document.querySelector('#offline-badge-text').textContent,
      cache: window.MW.state.cacheStatus,
      routes: Array.from(document.querySelectorAll('.screen')).map((e) => e.dataset.route),
      buttons: Array.from(document.querySelectorAll('#screen-home button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      mwKeys: Object.keys(window.MW),
    }));
    console.log('home:', JSON.stringify({ screen: home.screen, badge: home.badge, version: home.cache.version, routes: home.routes, buttons: home.buttons }));
    assert(home.screen === 'home', 'cold boot lands on Home');
    // SOUNDTRACK: the reduced list plus the score engine, 24 files at mw-final-v2.
    assert(/OFFLINE READY ✓ 24\/24 CACHED/.test(home.badge) && home.cache.version === 'mw-final-v2' && home.cache.missing.length === 0, 'the reduced precache plus the score (24 files, mw-final-v2) installed in full: ' + home.badge);
    assert(home.routes.join(',') === 'home,placement,handshake,round,gameover', 'the shell has exactly the five match screens');
    assert(!home.buttons.some((b) => VOCAB.test(b)), 'no Home button leads to the feature: ' + home.buttons.join(' | '));
    assert(!home.mwKeys.some((k) => /orders|sealed|card/i.test(k)), 'the MW debug surface exposes nothing of the feature');
    await page.screenshot({ path: path.join(OUT, 'orders-removed-home.png') });

    // Every word in the document, including hidden screens and attribute copy.
    const copy = await page.evaluate(() => {
      const attrs = Array.from(document.querySelectorAll('[title],[aria-label],[placeholder],[id],[class],[data-action],[data-go]'))
        .flatMap((e) => ['title', 'aria-label', 'placeholder', 'id', 'class', 'data-action', 'data-go'].map((a) => e.getAttribute(a)).filter(Boolean));
      return { text: document.documentElement.textContent.replace(/\s+/g, ' '), attrs, title: document.title };
    });
    const textHits = copy.text.match(new RegExp(`.{0,30}(?:${VOCAB.source}).{0,30}`, 'gi')) || [];
    const attrHits = copy.attrs.filter((a) => VOCAB.test(a));
    console.log('document scan: text hits', JSON.stringify(textHits), 'attribute hits', JSON.stringify(attrHits));
    assert(textHits.length === 0 && attrHits.length === 0, 'no feature vocabulary anywhere in the live document');

    // The old route is not a route any more: it falls back to Home.
    await page.evaluate(() => window.MW.go('placement'));
    await page.waitForFunction(() => document.body.dataset.screen === 'placement');
    await page.evaluate(() => { location.hash = '#/sealed'; });
    await page.waitForFunction(() => document.body.dataset.screen === 'home');
    await page.evaluate(() => window.MW.go('sealed'));
    const fallback = await page.evaluate(() => ({ screen: document.body.dataset.screen, title: document.querySelector('#topbar-title').textContent, visible: Array.from(document.querySelectorAll('.screen')).filter((s) => !s.hidden).map((s) => s.dataset.route), sealedEl: !!document.querySelector('#screen-sealed') }));
    console.log('old route #/sealed:', JSON.stringify(fallback));
    assert(fallback.screen === 'home' && fallback.visible.join() === 'home' && fallback.title === 'MODEM WARFARE' && !fallback.sealedEl, 'the old route falls back to Home; no sealed screen element exists');
    await page.evaluate(() => window.MW.go('home'));

    // Nothing of the module remains on the server, in the cache, or among what the page loaded.
    const modules = {};
    for (const m of ['orders.js', 'orders-ui.js']) {
      const r = await page.request.get(`${srv.base}/app/js/${m}`);
      modules[m] = r.status();
    }
    console.log('server status for the old modules:', JSON.stringify(modules));
    assert(Object.values(modules).every((s) => s === 404), 'the orders modules are not served');
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const keys = await (await caches.open(names.find((n) => n.includes('mw-final-v2')))).keys();
      const loaded = performance.getEntriesByType('resource').map((e) => e.name);
      return { names, count: keys.length, cachedOrders: keys.map((k) => k.url).filter((u) => /orders/i.test(u)), loadedOrders: loaded.filter((u) => /orders/i.test(u)) };
    });
    console.log('caches:', JSON.stringify(cached));
    assert(cached.names.length === 1 && cached.names[0] === 'modem-warfare-mw-final-v2', 'exactly one cache, the final version');
    assert(cached.count === 24 && cached.cachedOrders.length === 0, `24 cached URLs, none of the feature (got ${cached.count})`);
    assert(cached.loadedOrders.length === 0, 'the page loaded no orders resource');

    // A stale card scan goes to the receive gate like any text and is rejected, with no error.
    await page.click('[data-transport-choice="qr"]');
    await page.click('[data-action="new-match"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'placement');
    await page.click('[data-action="lock"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && document.querySelector('#qr-handshake svg'));
    const stale = await page.evaluate((text) => {
      const res = window.MW.routeText(text, { source: 'test' });
      return { status: res.status, reason: res.reason, screen: document.body.dataset.screen, contact: document.querySelector('#contact-handshake').dataset.state };
    }, OLD_CARD_TEXT);
    console.log('stale card scan:', JSON.stringify(stale));
    assert(stale.status === 'rejected' && stale.screen === 'handshake' && stale.contact !== 'contact', 'an old card text is rejected by the frame gate like any foreign text');
    await page.click('#screen-handshake [data-action="manual-toggle"]');
    await page.fill('#screen-handshake .manual__input', OLD_CARD_TEXT);
    await page.click('#screen-handshake .manual button[type="submit"]');
    const typed = await page.evaluate(() => window.MW.state.gate.log[window.MW.state.gate.log.length - 1]);
    assert(typed.status === 'rejected', 'typed in, the old card text is rejected too: ' + JSON.stringify(typed));

    // Reload (served from the worker now) and account for every storage key touched since the first boot:
    // the record restarts with each document, so the first document's record is carried across.
    const firstBoot = await page.evaluate(() => window.__storageTouched.slice());
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#offline-badge').dataset.state === 'ready', null, { timeout: 20000 });
    const storage = await page.evaluate(([key, before]) => ({
      touched: Array.from(new Set(before.concat(window.__storageTouched))),
      stillThere: localStorage.getItem(key),
      keys: Object.keys(localStorage),
    }), [STORE_KEY, firstBoot]);
    console.log('storage keys touched by the app:', JSON.stringify(storage.touched.filter((t) => !t.startsWith('setItem:' + STORE_KEY))));
    console.log('localStorage keys now:', JSON.stringify(storage.keys));
    // The seed itself is the one write to the key this gate made before the app ran; the app made none.
    const appTouches = storage.touched.filter((t) => t !== `setItem:${STORE_KEY}`);
    assert(!appTouches.some((t) => /orders|sealed|card/i.test(t)), 'the app never read, wrote or removed the card store key: ' + appTouches.join(', '));
    assert(!appTouches.includes('clear'), 'the app never cleared storage');
    assert(appTouches.some((t) => t.startsWith('getItem:mw.transport.v1')), 'the transport setting is still read (storage was watched)');
    assert(storage.stillThere === OLD_CARDS, 'the old cards are untouched in storage: no migration, no cleanup');

    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('orders: PASS (removed — five screens, no entry point, no module served or cached, old route falls back to Home, stale card rejected, ' + STORE_KEY + ' never read)');
    return { ok: true, home, modules, cached, stale, storage };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('orders.js')) run().catch((e) => { console.error(e); process.exit(1); });
