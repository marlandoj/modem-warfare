// REMOVAL gate (unit): Sealed Orders is out of the app tree and stays out.
// Run: node --test tests/orders.test.js
//
// Until the SHIP build this file tested the card codec. The operator ruled on
// 2026-11-02 that Sealed Orders leaves the entry, so the file now proves the
// removal instead: the modules are gone, the app tree carries none of the
// feature's vocabulary, the precache is the reduced 23-file list, no storage
// key of the feature is named anywhere the shipped app can read it, and the
// parts the ruling left alone (CSP, SOUND, the five match screens) are as
// they were. This is the string evidence quoted in docs/REMOVAL-REPORT.md,
// run as a test so it cannot drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');

// The feature's vocabulary: the mode name, the screen name, the card wording.
const VOCAB = /sealed|orders|household/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function scan(dirs) {
  const files = dirs.flatMap((d) => (fs.existsSync(d) ? walk(d) : []));
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'latin1');
    const lines = text.split('\n');
    lines.forEach((line, i) => { if (VOCAB.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  }
  return { files: files.map((f) => path.relative(ROOT, f)), hits };
}

test('removal: the orders modules no longer exist', () => {
  for (const f of ['app/js/orders.js', 'app/js/orders-ui.js']) {
    assert.equal(fs.existsSync(path.join(ROOT, f)), false, `${f} must be gone`);
  }
});

test('removal: a case-insensitive scan of the whole app tree for sealed|orders|household finds nothing', () => {
  const { files, hits } = scan([APP]);
  console.log(`# scanned ${files.length} files under app/ (code, styles, markup, manifest, service worker, icons, vendor)`);
  for (const h of hits) console.log('# HIT ' + h);
  assert.ok(files.length >= 20, 'the app tree was actually walked');
  assert.deepEqual(hits, [], 'no feature vocabulary anywhere under app/');
});

test('removal: the dev harness, the tools, the landing page and the manifest carry no dangling reference either', () => {
  const { files, hits } = scan([path.join(ROOT, 'dev'), path.join(ROOT, 'tools'), path.join(ROOT, 'spike')]);
  for (const f of ['index.html', 'package.json']) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // package.json names this very file in its test script; that line is the gate, not a reference to the feature.
    text.split('\n').forEach((line, i) => { if (VOCAB.test(line) && !line.includes('tests/orders.test.js')) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`); });
    files.push(f);
  }
  console.log(`# scanned ${files.length} files under dev/, tools/, spike/ plus index.html and package.json`);
  for (const h of hits) console.log('# HIT ' + h);
  assert.deepEqual(hits, [], 'no feature vocabulary outside app/ in code that runs or builds');
});

test('removal: the precache is the reduced 23-file list at mw-final-v1 and every entry exists', () => {
  const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
  assert.match(sw, /const VERSION = 'mw-final-v1';/, 'cache version bumped to mw-final-v1');
  const list = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(list, 'PRECACHE list found');
  const entries = Array.from(list[1].matchAll(/'([^']+)'/g), (m) => m[1]);
  console.log(`# precache: ${entries.length} entries, version mw-final-v1`);
  assert.equal(entries.length, 23, 'the reduced precache has 23 entries');
  assert.deepEqual(entries.filter((e) => /orders/i.test(e)), [], 'no orders entry in the precache');
  for (const e of entries) {
    if (e === './') continue;
    assert.ok(fs.existsSync(path.join(APP, e)), `precached ${e} exists`);
  }
});

test('removal: the shell has exactly the five match screens and no entry point to the feature', () => {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const routes = Array.from(html.matchAll(/<section[^>]*\bdata-route="([^"]+)"/g), (m) => m[1]);
  assert.deepEqual(routes, ['home', 'placement', 'handshake', 'round', 'gameover'], 'five screens, in order');
  assert.doesNotMatch(html, /screen-sealed|data-go="sealed"|data-action="[^"]*order/i, 'no sealed screen, route or action');
  const appJs = fs.readFileSync(path.join(APP, 'js', 'app.js'), 'utf8');
  assert.match(appJs, /const ROUTES = \['home', 'placement', 'handshake', 'round', 'gameover'\];/, 'the router knows only the five match routes');
  assert.doesNotMatch(appJs, /orders-ui|\.\/orders\.js|MW\.orders/, 'app.js imports and exposes nothing of the feature');
});

test('removal: the only storage key the shipped app names is the transport setting (the card store key is never read)', () => {
  const keys = new Set();
  for (const f of walk(path.join(APP, 'js'))) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/['"`](mw\.[a-z-]+\.v\d+[^'"`$]*)['"`$]/g)) keys.add(m[1]);
  }
  console.log('# storage keys named under app/js:', JSON.stringify([...keys]));
  assert.deepEqual([...keys].sort(), ['mw.transport.v1', 'mw.transport.v1.dev-'], 'only the transport key (and its dev-instance form)');
  assert.ok(![...keys].some((k) => /orders/i.test(k)), 'mw.orders.v1 is not named: cards a phone kept are simply never read again');
});

test('untouched: the content-security policy is byte-identical to the shipped one, SOUND stays true', () => {
  const lines = fs.readFileSync(path.join(APP, 'index.html'), 'utf8').split('\n');
  const i = lines.findIndex((l) => l.includes('http-equiv="Content-Security-Policy"'));
  assert.ok(i >= 0, 'CSP meta present');
  const tag = lines[i] + '\n' + lines[i + 1] + '\n';
  const digest = crypto.createHash('md5').update(tag).digest('hex');
  console.log('# CSP tag md5:', digest);
  assert.equal(digest, '6c8d92f44b4b6671a44c5abc62e23ca9', 'CSP meta tag unchanged since the SHIP build');
  assert.match(fs.readFileSync(path.join(APP, 'js', 'config.js'), 'utf8'), /^export const SOUND = true;/m, 'SOUND flag stays, default ON');
});
