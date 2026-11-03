// SOUNDTRACK gate (unit): the score compiles, loops, layers and is code.
// Run: node --test tests/music.test.js
//
// The engine's WebAudio half needs a browser (tests/browser/soundtrack.js);
// this file proves the part that does not: every scene compiles from the
// notation into a well-formed event list, the theme loops in the 60-90 s
// band with no gap at the seam, the battle loop carries exactly the three
// layers the card asks for with the lead on the last one, the stings hand
// over to a scene, no pitch is out of range, and the score ships as code —
// no audio file is referenced by the engine, none exists under app/, and
// the precache names the engine (at mw-final-v3 since SHIPS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, midi, hz, melody, chords, drums } from '../app/js/music.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');

const compiled = Object.fromEntries(Object.entries(SCENES).map(([k, f]) => [k, f()]));
const seconds = (d) => (d.beats * 60) / d.bpm;

test('notation: pitches, lines, chords and drum grids compile as written', () => {
  assert.equal(midi('A4'), 69);
  assert.equal(midi('F#5'), 78);
  assert.equal(midi('Bb3'), 58);
  assert.equal(midi('D2'), 38);
  assert.ok(Math.abs(hz(69) - 440) < 1e-9);
  const m = melody('F#5 D5:.5 E5:.5 F#5:2 | r:1 A5:3*0.5', 'lead');
  assert.equal(m.beats, 8, 'a bar and a bar');
  assert.deepEqual(m.events.map((e) => [e.b, e.m]), [[0, 78], [1, 74], [1.5, 76], [2, 78], [5, 81]]);
  assert.equal(m.events[4].v, 0.5, 'velocity suffix');
  const c = chords('Dm Bb:2 Am:2');
  assert.equal(c.beats, 8);
  assert.deepEqual(c.chords.map((x) => x.name), ['Dm', 'Bb', 'Am']);
  assert.deepEqual(c.chords[0].notes, [62, 65, 69]);
  const d = drums('snare', 'x---x---x-rrx-x-', { bars: 2 });
  assert.equal(d.beats, 8);
  assert.equal(d.events.filter((e) => e.b < 4).length, 5 + 6, 'five hits and two three-stroke rolls per bar');
  assert.throws(() => drums('snare', 'x---'), /16 steps/);
  assert.throws(() => chords('Zz'), /no voicing/);
});

test('every scene compiles into a sorted, in-range, in-bounds event list', () => {
  for (const [name, d] of Object.entries(compiled)) {
    assert.ok(d.events.length > 0, `${name} has events`);
    assert.ok(d.bpm >= 60 && d.bpm <= 120, `${name} tempo ${d.bpm} is a human tempo`);
    for (let i = 1; i < d.events.length; i++) assert.ok(d.events[i].b >= d.events[i - 1].b, `${name} events sorted by beat`);
    for (const e of d.events) {
      assert.ok(e.b >= 0 && e.b < d.beats, `${name}: an event starts inside the scene (${e.b} of ${d.beats})`);
      assert.ok(e.b + e.d <= d.beats + 0.01, `${name}: an event ends inside the scene`);
      if (e.m !== null) assert.ok(e.m >= 36 && e.m <= 96, `${name}: ${e.i} pitch ${e.m} between C2 and C7`);
      assert.ok(e.v > 0 && e.v <= 1, `${name}: velocity ${e.v} in (0, 1]`);
      assert.ok(e.d > 0, `${name}: duration positive`);
    }
    console.log(`# ${name}: ${d.events.length} events, ${d.beats} beats at ${d.bpm} bpm = ${seconds(d).toFixed(1)} s, ${d.loop ? 'loops' : 'then ' + d.then.scene}, instruments ${[...new Set(d.events.map((e) => e.i))].join(' ')}`);
  }
});

test('the theme loops at a minute to ninety seconds with no gap at the seam', () => {
  const t = compiled.theme;
  assert.ok(t.loop, 'the theme loops');
  const s = seconds(t);
  assert.ok(s >= 60 && s <= 90, `theme loop ${s.toFixed(1)} s is between 60 and 90`);
  assert.equal(t.bpm, 104, 'the processional tempo');
  const starts = [...new Set(t.events.map((e) => e.b))];
  assert.equal(starts[0], 0, 'something sounds on beat 0');
  let maxGap = 0;
  for (let i = 1; i < starts.length; i++) maxGap = Math.max(maxGap, starts[i] - starts[i - 1]);
  maxGap = Math.max(maxGap, t.beats - starts[starts.length - 1]);
  assert.ok(maxGap <= 1, `no silence longer than a beat anywhere, including across the seam (max gap ${maxGap} beats)`);
  const insts = new Set(t.events.map((e) => e.i));
  for (const i of ['arp', 'bass', 'lead', 'brass', 'snare', 'timpani', 'kick', 'hat']) assert.ok(insts.has(i), `the theme uses ${i}`);
  // The deck leads: the first bar has arps, octave bass and the half-time kit, and no brass yet.
  const bar1 = t.events.filter((e) => e.b < 4);
  assert.ok(bar1.some((e) => e.i === 'arp') && bar1.some((e) => e.i === 'bass') && bar1.some((e) => e.i === 'kick'), 'bar 1 is the flight deck');
  assert.ok(!bar1.some((e) => e.i === 'brass'), 'the brass waits for its fanfare');
  // The march interlude: bars 13-20 carry brass chords and the march snare and no arps.
  const march = t.events.filter((e) => e.b >= 48 && e.b < 80);
  assert.ok(march.some((e) => e.i === 'brass') && march.some((e) => e.i === 'snare') && march.some((e) => e.i === 'timpani'), 'the interlude is the ceremonial march');
  assert.ok(!march.some((e) => e.i === 'arp'), 'the arps rest through the march');
  // Octave bass: consecutive bass notes under one chord are an octave apart.
  const bassNotes = t.events.filter((e) => e.i === 'bass' && e.b < 4).map((e) => e.m);
  assert.ok(bassNotes.length >= 8 && bassNotes.every((m, i) => i === 0 || Math.abs(m - bassNotes[i - 1]) === 12), 'octave bass drive');
});

test('the placement variant is the march, quiet and dark', () => {
  const p = compiled.placement;
  assert.ok(p.loop && p.gain < compiled.theme.gain / 2, 'placement is low in the mix');
  const insts = new Set(p.events.map((e) => e.i));
  assert.ok(insts.has('brassDark') && insts.has('timpani'), 'dark brass and timpani');
  assert.ok(!insts.has('arp') && !insts.has('lead') && !insts.has('kick') && !insts.has('snare'), 'no deck, no snare in the chart room');
});

test('the battle loop has three layers: ostinato, the first hit, the final rounds', () => {
  const b = compiled.battle;
  assert.ok(b.loop, 'the battle loops');
  const byLayer = (l) => new Set(b.events.filter((e) => e.l === l).map((e) => e.i));
  assert.deepEqual([...new Set(b.events.map((e) => e.l))].sort(), [0, 1, 2], 'layers 0, 1, 2');
  const l0 = byLayer(0); const l1 = byLayer(1); const l2 = byLayer(2);
  assert.ok(l0.has('brassLow') && l0.has('timpani') && l0.has('arp'), 'layer 0: low brass pulse, timpani, arp');
  assert.ok(!l0.has('lead') && !l0.has('snare') && !l0.has('bass'), 'layer 0 is the bare ostinato');
  assert.ok(l1.has('snare') && l1.has('kick') && l1.has('bass') && l1.has('hat'), 'layer 1: the kit and the octave bass');
  assert.ok(l2.has('lead'), 'layer 2: the lead line');
  assert.ok(!l0.has('lead') && !l1.has('lead'), 'the lead arrives only in the final rounds');
  const lead = b.events.filter((e) => e.i === 'lead');
  assert.ok(lead.length >= 24 && lead.every((e) => e.l === 2), 'a full lead line, all on layer 2');
  // The ostinato never leaves a bar empty on layer 0.
  for (let bar = 0; bar < b.beats; bar += 4) assert.ok(b.events.some((e) => e.l === 0 && e.b >= bar && e.b < bar + 4), `layer 0 sounds in bar ${bar / 4 + 1}`);
});

test('the stings are short and hand over: victory to the theme at strength, defeat to the quiet march', () => {
  const v = compiled.victory; const d = compiled.defeat;
  assert.ok(!v.loop && !d.loop, 'stings do not loop');
  assert.ok(seconds(v) < 12 && seconds(d) < 12, `stings are short (${seconds(v).toFixed(1)} s, ${seconds(d).toFixed(1)} s)`);
  assert.equal(v.then.scene, 'theme');
  assert.ok(v.then.gain > compiled.theme.gain, 'victory takes the theme back louder than Home plays it');
  assert.equal(d.then.scene, 'placement');
  assert.ok(d.then.gain < compiled.placement.gain, 'after defeat the march is lower still');
  assert.ok(v.events.some((e) => e.i === 'brass') && v.events.some((e) => e.i === 'timpani'), 'victory is a brass fanfare');
  const top = d.events.filter((e) => e.i === 'brassDark' && e.v > 0.5).map((e) => e.m);
  assert.ok(top.length >= 4 && top.every((m, i) => i === 0 || m < top[i - 1]), 'defeat is a descent: its line only falls');
  assert.ok(!d.events.some((e) => ['kick', 'snare', 'hat', 'arp', 'lead'].includes(e.i)), 'sombre: brass and timpani only');
});

test('the score is code: no audio file is referenced, none exists under app/, the precache names the engine at mw-final-v3', () => {
  const src = fs.readFileSync(path.join(APP, 'js', 'music.js'), 'utf8');
  assert.doesNotMatch(src, /\.(mp3|wav|ogg|m4a|aac|flac|opus|mid|midi)\b/i, 'music.js names no audio file');
  assert.doesNotMatch(src, /fetch\(|decodeAudioData|XMLHttpRequest|<audio|new Audio\(/, 'music.js loads nothing');
  const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };
  const files = walk(APP).map((f) => path.relative(ROOT, f));
  const audio = files.filter((f) => /\.(mp3|wav|ogg|m4a|aac|flac|opus|mid|midi)$/i.test(f));
  assert.deepEqual(audio, [], 'no audio file anywhere under app/');
  const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
  assert.match(sw, /const VERSION = 'mw-final-v3';/, 'cache version is mw-final-v3 (SHIPS)');
  const entries = Array.from(sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g), (m) => m[1]);
  assert.ok(entries.includes('./js/music.js'), 'the engine is precached');
  assert.equal(entries.length, 25, '25 files');
  const size = fs.statSync(path.join(APP, 'js', 'music.js')).size;
  console.log(`# app/js/music.js: ${size} bytes in the precache (${entries.length} files, mw-final-v3); ${files.length} files under app/, 0 audio files`);
  assert.ok(size < 60000, 'the whole score is under 60 KB of code');
});
