// Shared helpers for the browser-level tests: static server on a free port,
// Chromium launch with the flags each test needs, console/pageerror capture.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from '../../tools/serve.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'test-output');
fs.mkdirSync(OUT, { recursive: true });

export async function startServer({ overrides = {} } = {}) {
  const server = createServer(ROOT, { overrides });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, port, base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

export const AUDIO_ARGS = [
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
];

export async function launch({ args = [], persistentDir = null, offline = false } = {}) {
  if (persistentDir) {
    const ctx = await chromium.launchPersistentContext(persistentDir, { args, offline, viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
    return { browser: ctx.browser(), context: ctx, close: () => ctx.close() };
  }
  const browser = await chromium.launch({ args });
  const context = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, permissions: ['microphone', 'camera'] });
  return { browser, context, close: () => browser.close() };
}

export function tempProfile(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mw-${label}-`));
}

export function capture(page, label = '') {
  const errors = [];
  const console_ = [];
  page.on('console', (m) => { console_.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => console_.push(`[requestfailed] ${r.url()} ${r.failure() && r.failure().errorText}`));
  return { errors, console: console_, label };
}

export function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

export function banner(title) {
  console.log(`\n=== ${title} ===`);
}
