// Gallery assets for the submission, made from the shipped build itself.
//   node tools/gallery.js            (after `npm test`, which fills test-output/)
//
// Writes:
//   thumbnail.png        the Salute composition: two phones face to face, one
//                        QR, built from two real handshake screenshots that the
//                        viewport gate took of this tree (412x915, QR mode).
//   screenshots/*.png    the current build's real screens: the gate evidence in
//                        test-output/ copied under gallery names, plus one
//                        Sealed Orders card captured here at phone size (the
//                        orders gate only shows the card inside the harness).
//
// No mockups: every pixel of every screen comes from headless Chromium running
// app/ as served by tools/serve.js. Dev tool only — not in the precache.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const candidates = [path.join(repoRoot, '.browsers'), path.join(repoRoot, '..', '_tools', 'browsers')];
  try {
    const pwDir = fs.realpathSync(path.join(repoRoot, 'node_modules', 'playwright'));
    candidates.push(path.resolve(pwDir, '..', '..', 'browsers'));
  } catch { /* playwright not installed */ }
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) process.env.PLAYWRIGHT_BROWSERS_PATH = found;
}
const { chromium } = await import('playwright');
const { createServer } = await import('./serve.js');

const OUT = path.join(repoRoot, 'test-output');
const SHOTS = path.join(repoRoot, 'screenshots');
const PHONE = { width: 412, height: 915 };

// Gate evidence -> gallery name. Every source is written by `npm test`.
const COPIES = [
  ['screen-1-home.png', '01-home.png'],
  ['viewport-412x915-qr-placement.png', '02-placement.png'],
  ['viewport-412x915-qr-handshake.png', '03-salute-qr.png'],
  ['viewport-412x915-qr-target.png', '04-battle-target.png'],
  ['viewport-412x915-chirp-exchange.png', '05-battle-exchange-chirp.png'],
  ['viewport-412x915-qr-reveal.png', '06-reveal.png'],
  ['viewport-412x915-qr-gameover-verdict.png', '07-game-over-verified.png'],
];

function must(file) {
  const p = path.join(OUT, file);
  if (!fs.existsSync(p)) throw new Error(`missing ${p} — run \`npm test\` first`);
  return p;
}

const server = createServer(repoRoot);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const [src, dst] of COPIES) {
    fs.copyFileSync(must(src), path.join(SHOTS, dst));
    console.log(`screenshots/${dst} <- test-output/${src}`);
  }

  // 1. A Sealed Orders card at phone size, composed through the shipped UI.
  {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`${base}/app/`);
    await page.waitForFunction(() => document.querySelector('#offline-badge').dataset.state === 'ready', null, { timeout: 20000 });
    await page.click('[data-go="sealed"]');
    await page.click('[data-orders="compose"]');
    await page.selectOption('#orders-label', 'KITCHEN');
    await page.fill('#orders-note', 'Bins go out Tuesday night.\nSpare key is with Jordan. Gate code is on the fridge.');
    await page.fill('#orders-items', 'Feed the cat\nWater the tomatoes\nLock the side gate');
    await page.click('#btn-show-card');
    await page.waitForSelector('#qr-card svg', { timeout: 10000 });
    const card = await page.evaluate(() => ({ hop: document.querySelector('#card-hop').textContent, caption: document.querySelector('#caption-card').textContent }));
    await page.screenshot({ path: path.join(SHOTS, '08-sealed-orders-card.png') });
    console.log(`screenshots/08-sealed-orders-card.png <- app/ at ${PHONE.width}x${PHONE.height}: ${card.hop} · ${card.caption}`);
    await context.close();
  }

  // 2. The thumbnail: the Salute composition of the submission pack's mockup,
  //    rebuilt from real screens — left phone holds up its handshake QR, right
  //    phone shows the reveal that follows (two HITs, a ship sunk). Both are
  //    the viewport gate's QR-mode screenshots of this tree (412x915).
  {
    const left = must('viewport-412x915-qr-handshake.png');
    const right = must('viewport-412x915-qr-reveal.png');
    const W = 1280; const H = 720;
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
    const page = await context.newPage();
    await page.goto(`${base}/index.html`);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#061a2e;}
      body{font-family:"Impact","Haettenschweiler","Franklin Gothic Demi Cond","Arial Narrow","Roboto Condensed",sans-serif-condensed,sans-serif;color:#e6f2f5;position:relative;}
      .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(61,255,143,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(61,255,143,.10) 1px,transparent 1px);background-size:48px 48px;}
      .glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 58%,rgba(255,177,0,.18),transparent 55%),radial-gradient(ellipse at 50% 0%,rgba(61,255,143,.10),transparent 50%);}
      .vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,transparent 55%,rgba(3,16,28,.85) 100%);}
      .stage{position:absolute;inset:0;perspective:1600px;}
      .phone{position:absolute;top:150px;width:208px;height:436px;border-radius:34px;background:#03101c;box-shadow:0 30px 60px rgba(0,0,0,.6),0 0 0 2px #1b2a38,inset 0 0 0 3px #0b1620;overflow:hidden;}
      .phone img{position:absolute;left:10px;top:10px;width:188px;height:416px;object-fit:cover;border-radius:24px;}
      .phone.l{left:250px;transform:rotateY(26deg) rotateZ(-5deg);transform-origin:right center;}
      .phone.r{right:250px;transform:rotateY(-26deg) rotateZ(5deg);transform-origin:left center;}
      .bolt{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;}
      .title{position:absolute;top:28px;left:0;right:0;text-align:center;font-size:74px;letter-spacing:.14em;line-height:1;text-shadow:0 0 24px rgba(230,242,245,.35),0 4px 0 #03101c;}
      .tag{position:absolute;top:104px;left:0;right:0;text-align:center;font-size:24px;letter-spacing:.42em;color:#ffb100;}
      .strap{position:absolute;bottom:34px;left:0;right:0;text-align:center;font-size:40px;letter-spacing:.18em;color:#3dff8f;text-shadow:0 0 18px rgba(61,255,143,.45);}
      .sub{position:absolute;bottom:12px;left:0;right:0;text-align:center;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.2em;color:#8fb0bf;}
    </style></head><body>
      <div class="grid"></div><div class="glow"></div>
      <div class="stage">
        <div class="phone l"><img src="${base}/test-output/${path.basename(left)}" alt=""></div>
        <div class="phone r"><img src="${base}/test-output/${path.basename(right)}" alt=""></div>
      </div>
      <svg class="bolt" viewBox="0 0 ${W} ${H}">
        <defs><filter id="g"><feGaussianBlur stdDeviation="6"/></filter></defs>
        <polyline points="470,368 520,368 548,306 582,446 612,276 640,436 668,316 696,408 724,346 752,388 778,368 810,368" fill="none" stroke="#ffb100" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" opacity=".55" filter="url(#g)"/>
        <polyline points="470,368 520,368 548,306 582,446 612,276 640,436 668,316 696,408 724,346 752,388 778,368 810,368" fill="none" stroke="#ffd479" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <div class="vignette"></div>
      <div class="title">MODEM WARFARE</div>
      <div class="tag">RADIO SILENCE</div>
      <div class="strap">NO INTERNET. JUST NOISE.</div>
      <div class="sub">TWO PHONES IN AIRPLANE MODE · QR SALUTE · MODEM CHIRP · NO SERVER · NO ACCOUNT</div>
    </body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode())));
    await page.screenshot({ path: path.join(repoRoot, 'thumbnail.png'), clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`thumbnail.png <- ${path.basename(left)} + ${path.basename(right)} (${W}x${H} @1.5)`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
