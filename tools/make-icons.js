#!/usr/bin/env node
// Rasterise app/icons/icon.svg to the PNG sizes the manifest lists, using
// headless Chromium via Playwright (dev dependency). Run once, commit the PNGs.
//   node tools/make-icons.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(ROOT, 'app/icons/icon.svg'), 'utf8');

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  // Maskable: keep the art inside the 80% safe zone by padding with navy.
  { file: 'maskable-512.png', size: 512, pad: 0.1 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  const off = Math.round(t.size * t.pad);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#061a2e;width:${t.size}px;height:${t.size}px;overflow:hidden">` +
    `<div style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body></html>`);
  const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: t.size, height: t.size }, omitBackground: false });
  fs.writeFileSync(path.join(ROOT, 'app/icons', t.file), buf);
  console.log('wrote', t.file, buf.length, 'bytes');
}
await browser.close();
