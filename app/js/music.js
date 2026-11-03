// Modem Warfare — the score. An original wartime soundtrack, synthesised at
// play time through WebAudio like every other sound in this app: no audio
// files, the music is this file (SOUNDTRACK build).
//
// Two idioms, evoked and never quoted:
//   the ceremonial  — a stately naval march: brass chords (detuned saw stacks
//                     through an enveloped lowpass), snare figures (filtered
//                     noise), timpani (a falling sine), 104 beats per minute;
//   the flight deck — pulsing analogue arpeggios, octave bass (short square
//                     pulses), a soaring detuned lead; half-time kick and
//                     backbeat, the same 104 so the two fuse without a seam.
//
// The score map (what plays where):
//   theme      Home. 32 bars / 73.8 s loop. Rock-forward: the deck leads
//              (arps + octave bass + half-time drums), the march brass arrives
//              as fanfare punctuation; a ceremonial march interlude (bars
//              13-20) opens back into the deck; the outro's brass chords and
//              snare roll turn around into bar 1, so the loop has no seam.
//   placement  the chart room: the march's eight bars as soft, dark brass pads
//              with a hushed melody, a clock-tick hat, timpani; 92 bpm, low.
//   battle     handshake + rounds. An 8-bar tension ostinato in D minor at
//              108 bpm: low brass pulse, timpani, a sparse arp (layer 0);
//              the first hit of the match brings kick, snare, hat, octave
//              bass and the full arp (layer 1); the final rounds (three ships
//              down on either side) bring the lead line and brass stabs
//              (layer 2). Layers only ever climb within a match.
//   victory    a brass fanfare sting, then the full theme back at strength
//              from its first lead section.
//   defeat     a short sombre brass descent (three bars at 72), then the
//              chart-room march, very low.
//
// Rules carried by the engine (SOUNDTRACK card):
//   - The chirp is sacred. duck(true) sets the duck gain to exactly 0 at the
//     current time (no ramp) and holds it there for the whole Sonar window:
//     every listen window and every chirp this phone sends. duck(false)
//     ramps back over 350 ms. The engine samples its own gain on every tick
//     while the Sonar is active and counts any non-zero reading as a
//     violation, so a test can read the evidence.
//   - Nothing is created until the first user gesture (start()), and nothing
//     at all when the Music setting is off or config.SOUND is false: no node,
//     no scheduler, no AudioContext of its own (it shares audio.js's, which
//     SOUND = false never creates).
//   - Only one scene plays at a time; a scene change fades the old graph out
//     over 120 ms and starts the new one; the same scene asked twice is a
//     no-op, so routing code can call setScene freely.
import { SOUND } from './config.js';
import { audioContext } from './audio.js';

// ------------------------------------------------------------- notation ---
// Pitches are MIDI numbers. A melodic line is a string of NOTE:BEATS tokens
// (BEATS defaults to 1; r = rest; *v sets a velocity 0..1; | is ignored).
// A chord line is CHORD:BEATS tokens resolved through VOICINGS. A drum line
// is one 16-step string per bar: x hit, o accent, g ghost, r roll, - rest.

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const VOICINGS = {
  // the deck (B minor / D major)
  Bm: 'B3 D4 F#4', G: 'G3 B3 D4', D: 'D4 F#4 A4', A: 'A3 C#4 E4', Em: 'E4 G4 B4', 'F#': 'A#3 C#4 F#4', 'F#sus': 'B3 C#4 F#4',
  // the march (D major, four voices)
  D4: 'D4 F#4 A4 D5', G4: 'G3 B3 D4 G4', A4: 'A3 C#4 E4 A4', Bm4: 'B3 D4 F#4 B4',
  // the battle (D minor)
  Dm: 'D4 F4 A4', Bb: 'Bb3 D4 F4', Am: 'A3 C#4 E4', Gm: 'G3 Bb3 D4', C: 'C4 E4 G4', Asus: 'A3 D4 E4',
};

const ROOTS = { Bm: 'B', G: 'G', D: 'D', A: 'A', Em: 'E', 'F#': 'F#', 'F#sus': 'F#', D4: 'D', G4: 'G', A4: 'A', Bm4: 'B', Dm: 'D', Bb: 'Bb', Am: 'A', Gm: 'G', C: 'C', Asus: 'A' };

function tokens(line) {
  return line.split(/\s+/).filter((t) => t && t !== '|');
}

/** A melodic line → events for one instrument. */
export function melody(line, inst, { layer = 0, vel = 0.8, offset = 0, legato = 0.92 } = {}) {
  const out = [];
  let b = offset;
  for (const t of tokens(line)) {
    const [head, v] = t.split('*');
    const [name, beats] = head.split(':');
    const d = beats === undefined ? 1 : Number(beats);
    if (name !== 'r') out.push({ b, d: d * legato, i: inst, m: midi(name), v: v ? Number(v) : vel, l: layer });
    b += d;
  }
  return { events: out, beats: b - offset };
}

/** A chord line → sustained chord events (brass pads) or just the chord map. */
export function chords(line, offset = 0) {
  const out = [];
  let b = offset;
  for (const t of tokens(line)) {
    const [name, beats] = t.split(':');
    const d = beats === undefined ? 4 : Number(beats);
    if (!VOICINGS[name]) throw new Error('no voicing for ' + name);
    out.push({ b, d, name, notes: VOICINGS[name].split(' ').map(midi), root: midi(ROOTS[name] + '2') });
    b += d;
  }
  return { chords: out, beats: b - offset };
}

export function pads(chordLine, inst, { layer = 0, vel = 0.5, offset = 0, legato = 0.98 } = {}) {
  const { chords: cs, beats } = chords(chordLine, offset);
  const events = [];
  for (const c of cs) for (const m of c.notes) events.push({ b: c.b, d: c.d * legato, i: inst, m, v: vel, l: layer });
  return { events, beats };
}

/** Short chord stabs at given beats (fanfare punctuation). at: [[beat, dur], ...] relative to offset. */
export function stabs(chordLine, inst, at, { layer = 0, vel = 0.7, offset = 0 } = {}) {
  const { chords: cs, beats } = chords(chordLine, offset);
  const events = [];
  for (const [beat, dur] of at) {
    const abs = offset + beat;
    const c = cs.find((x) => abs >= x.b && abs < x.b + x.d);
    if (!c) continue;
    for (const m of c.notes) events.push({ b: abs, d: dur, i: inst, m: m + 12, v: vel, l: layer });
  }
  return { events, beats };
}

/** Arpeggio over a chord line: pattern indexes into the chord tones spread over two octaves, one index per `step` beats. */
export function arp(chordLine, pattern, { step = 0.5, layer = 0, vel = 0.55, offset = 0, inst = 'arp', gate = 0.8 } = {}) {
  const { chords: cs, beats } = chords(chordLine, offset);
  const events = [];
  for (const c of cs) {
    const tones = c.notes.concat(c.notes.map((m) => m + 12));
    let k = 0;
    for (let b = c.b; b < c.b + c.d - 1e-9; b += step) {
      const idx = pattern[k % pattern.length];
      k += 1;
      if (idx === null) continue;
      events.push({ b, d: step * gate, i: inst, m: tones[idx % tones.length], v: vel, l: layer });
    }
  }
  return { events, beats };
}

/** Octave bass over a chord line: root2 / root3 alternating per `step` beats; `walk` = false keeps it on the root. */
export function bass(chordLine, { step = 0.5, layer = 0, vel = 0.7, offset = 0, octaves = [0, 12], inst = 'bass', gate = 0.7 } = {}) {
  const { chords: cs, beats } = chords(chordLine, offset);
  const events = [];
  for (const c of cs) {
    let k = 0;
    for (let b = c.b; b < c.b + c.d - 1e-9; b += step) {
      events.push({ b, d: step * gate, i: inst, m: c.root + octaves[k % octaves.length], v: vel, l: layer });
      k += 1;
    }
  }
  return { events, beats };
}

/** Timpani on the chord roots at given beats within each bar. */
export function timpani(chordLine, beatsInBar, { layer = 0, vel = 0.8, offset = 0 } = {}) {
  const { chords: cs, beats } = chords(chordLine, offset);
  const events = [];
  for (const c of cs) for (let bar = c.b; bar < c.b + c.d - 1e-9; bar += 4) for (const bb of beatsInBar) if (bb < 4 && bar + bb < c.b + c.d) events.push({ b: bar + bb, d: 1, i: 'timpani', m: c.root, v: vel, l: layer });
  return { events, beats };
}

/** A drum line: one 16-step string per bar, repeated `bars` times if a single bar is given. */
export function drums(inst, line, { bars = null, layer = 0, vel = 0.8, offset = 0 } = {}) {
  let pats = line.split('|').map((s) => s.replace(/\s+/g, '')).filter(Boolean);
  if (bars !== null) { const base = pats; pats = []; for (let i = 0; i < bars; i++) pats.push(base[i % base.length]); }
  const events = [];
  pats.forEach((p, bar) => {
    if (p.length !== 16) throw new Error('drum bar must have 16 steps: ' + p);
    for (let s = 0; s < 16; s++) {
      const ch = p[s];
      const b = offset + bar * 4 + s / 4;
      if (ch === 'x') events.push({ b, d: 0.25, i: inst, m: null, v: vel, l: layer });
      else if (ch === 'o') events.push({ b, d: 0.25, i: inst, m: null, v: Math.min(1, vel * 1.3), l: layer });
      else if (ch === 'g') events.push({ b, d: 0.25, i: inst, m: null, v: vel * 0.45, l: layer });
      else if (ch === 'r') for (let k = 0; k < 3; k++) events.push({ b: b + k / 12, d: 0.08, i: inst, m: null, v: vel * (0.35 + 0.15 * k), l: layer });
    }
  });
  return { events, beats: pats.length * 4 };
}

function octaveUp(part) {
  return { events: part.events.map((e) => ({ ...e, m: e.m + 12 })), beats: part.beats };
}

function merge(parts) {
  const events = parts.flatMap((p) => p.events);
  events.sort((a, b) => a.b - b.b || (a.i < b.i ? -1 : 1));
  return events;
}

// ----------------------------------------------------------------- score ---

// The deck's eight bars and the march's eight bars share a tonal centre
// (B minor / D major), so the theme moves between them without modulating.
const DECK = 'Bm G D A Bm G Em F#';
const MARCH = 'D4 D4 G4 A4 D4 Bm4 G4:2 A4:2 D4';
const INTRO = 'Bm Bm G A';
const OUTRO = 'G A Em F#sus:2 F#:2';

// The deck lead, eight bars, original. The second pass ends on the tonic to
// open the outro.
const DECK_LEAD = `F#5 D5:.5 E5:.5 F#5:2 | G5:1.5 A5:.5 B5:2 | A5 F#5 D5 E5 | F#5 E5 C#5:2 |
                   B4:.5 D5:.5 F#5 B5:2 | A5 G5 F#5 G5 | E5:1.5 F#5:.5 G5:2 | A#5 F#5 C#6:2`;
const DECK_LEAD_2 = `F#5 D5:.5 E5:.5 F#5:2 | G5:1.5 A5:.5 B5:2 | A5 F#5 D5 E5 | F#5 E5 C#5:2 |
                     B4:.5 D5:.5 F#5 B5:2 | A5 G5 F#5 G5 | G5 F#5 E5:2 | C#6 A#5 F#5:2`;
// The march melody, eight bars, brass voice.
const MARCH_LEAD = `D5 D5:.5 D5:.5 F#5 A5 | B5:1.5 A5:.5 F#5:2 | G5 B5 D6:1.5 B5:.5 | A5 C#5 E5:2 |
                    F#5 F#5:.5 F#5:.5 A5 D6 | C#6 B5 A5 F#5 | G5 A5 B5 C#6 | D6:3 r`;
// The fanfare call in the intro (bars 3-4), unison brass.
const CALL = 'r:2 F#4:.5 F#4:.5 F#4 | B4:1.5 A4:.5 F#4:2';

const HALF_TIME_KICK = 'x-------x-----x-';
const HALF_TIME_SNARE = '--------x-------';
const HAT_8 = 'x-x-x-x-x-x-x-x-';
const MARCH_SNARE = 'x---x---x-rrx-x-|x---x---x-x-rrx-';
const MARCH_SNARE_LAST = 'x---x---x-rrx-x-|x---x-x-rrrrrro-';

export function theme() {
  const parts = [];
  // bars 1-4: the deck leads, no melody yet; the fanfare call answers in bars 3-4.
  parts.push(arp(INTRO, [0, 1, 2, 3, 4, 3, 2, 1], { offset: 0, vel: 0.5 }));
  parts.push(bass(INTRO, { offset: 0 }));
  parts.push(drums('kick', HALF_TIME_KICK, { bars: 4, offset: 0 }));
  parts.push(drums('hat', HAT_8, { bars: 4, offset: 0, vel: 0.35 }));
  parts.push(drums('snare', HALF_TIME_SNARE, { bars: 4, offset: 0, vel: 0.7 }));
  parts.push(melody(CALL, 'brass', { offset: 8, vel: 0.6 }));
  parts.push(octaveUp(melody(CALL, 'brass', { offset: 8, vel: 0.45 })));
  // bars 5-12: the deck with the lead; brass stabs punctuate the 'and of 4' of bars 8 and 12.
  parts.push(arp(DECK, [0, 1, 2, 3, 4, 3, 2, 1], { offset: 16, vel: 0.55 }));
  parts.push(bass(DECK, { offset: 16 }));
  parts.push(drums('kick', HALF_TIME_KICK, { bars: 8, offset: 16 }));
  parts.push(drums('hat', HAT_8, { bars: 8, offset: 16, vel: 0.35 }));
  parts.push(drums('snare', HALF_TIME_SNARE, { bars: 8, offset: 16, vel: 0.75 }));
  parts.push(melody(DECK_LEAD, 'lead', { offset: 16, vel: 0.8 }));
  parts.push(stabs(DECK, 'brass', [[15.5, 0.4], [31, 1], [31.5, 0.4]], { offset: 16, vel: 0.6 }));
  // bars 13-20: the ceremonial interlude — brass chords, the march melody, march snare, timpani; the arps rest.
  parts.push(pads(MARCH, 'brass', { offset: 48, vel: 0.42 }));
  parts.push(melody(MARCH_LEAD, 'brass', { offset: 48, vel: 0.62 }));
  parts.push(drums('snare', MARCH_SNARE + '|' + MARCH_SNARE + '|' + MARCH_SNARE + '|' + MARCH_SNARE_LAST, { offset: 48, vel: 0.7 }));
  parts.push(timpani(MARCH, [0, 2], { offset: 48, vel: 0.7 }));
  parts.push(bass(MARCH, { offset: 48, step: 1, octaves: [0], vel: 0.6, gate: 0.9 }));
  // bars 21-28: the deck again, lead's second pass, brass pads under it and stabs.
  parts.push(arp(DECK, [0, 1, 2, 3, 4, 3, 2, 1], { offset: 80, vel: 0.58 }));
  parts.push(bass(DECK, { offset: 80 }));
  parts.push(drums('kick', HALF_TIME_KICK, { bars: 8, offset: 80 }));
  parts.push(drums('hat', HAT_8, { bars: 8, offset: 80, vel: 0.4 }));
  parts.push(drums('snare', HALF_TIME_SNARE, { bars: 8, offset: 80, vel: 0.8 }));
  parts.push(melody(DECK_LEAD_2, 'lead', { offset: 80, vel: 0.85 }));
  parts.push(pads(DECK, 'brass', { offset: 80, vel: 0.22 }));
  parts.push(stabs(DECK, 'brass', [[15.5, 0.4], [31, 1], [31.5, 0.4]], { offset: 80, vel: 0.6 }));
  // bars 29-32: the outro — brass chords over the deck, the snare roll, timpani; turns around into bar 1.
  parts.push(arp(OUTRO, [0, 1, 2, 3, 4, 3, 2, 1], { offset: 112, vel: 0.5 }));
  parts.push(bass(OUTRO, { offset: 112 }));
  parts.push(drums('kick', HALF_TIME_KICK, { bars: 4, offset: 112 }));
  parts.push(drums('hat', HAT_8, { bars: 4, offset: 112, vel: 0.35 }));
  parts.push(drums('snare', HALF_TIME_SNARE + '|' + HALF_TIME_SNARE + '|' + HALF_TIME_SNARE + '|' + '--------x---rrrr', { offset: 112, vel: 0.75 }));
  parts.push(pads(OUTRO, 'brass', { offset: 112, vel: 0.45 }));
  parts.push(timpani(OUTRO, [0], { offset: 112, vel: 0.7 }));
  return { name: 'theme', bpm: 104, beats: 128, loop: true, gain: 0.3, events: merge(parts) };
}

export function placement() {
  const parts = [];
  parts.push(pads(MARCH, 'brassDark', { offset: 0, vel: 0.5 }));
  parts.push(melody(MARCH_LEAD, 'brassDark', { offset: 0, vel: 0.4 }));
  parts.push(timpani(MARCH, [0], { offset: 0, vel: 0.45 }));
  parts.push(drums('hat', 'x---x---x---x---', { bars: 8, offset: 0, vel: 0.22 }));
  return { name: 'placement', bpm: 92, beats: 32, loop: true, gain: 0.11, events: merge(parts) };
}

const BATTLE = 'Dm Dm Bb Am Dm Dm Gm Am';
const BATTLE_LEAD = `A4:.5 D5:.5 F5 E5 D5 | A5:2 G5 F5 | D5 F5 Bb5:2 | A5 G5:.5 F5:.5 E5:2 |
                     D5:.5 F5:.5 A5 D6:2 | C6 A5 F5 G5 | G5 Bb5 D6:1.5 C6:.5 | C#6 A5 E5:2`;

export function battle() {
  const parts = [];
  // layer 0: the ostinato — low brass pulse on the root, timpani, a sparse arp.
  parts.push(bass(BATTLE, { offset: 0, step: 1, octaves: [0], inst: 'brassLow', vel: 0.55, gate: 0.6 }));
  parts.push(timpani(BATTLE, [0], { offset: 0, vel: 0.7 }));
  parts.push({ events: timpani('Am:4', [2], { offset: 12, vel: 0.6 }).events.concat(timpani('Am:4', [2], { offset: 28, vel: 0.6 }).events), beats: 32 });
  parts.push(arp(BATTLE, [0, null, 2, null, 1, null, 3, null], { offset: 0, vel: 0.45, layer: 0 }));
  // layer 1: the first hit — kick, snare, hat, octave bass, the arp fills in.
  parts.push(drums('kick', 'x---x---x-x-----', { bars: 8, offset: 0, layer: 1 }));
  parts.push(drums('snare', '----x-------x--g', { bars: 8, offset: 0, layer: 1, vel: 0.8 }));
  parts.push(drums('hat', HAT_8, { bars: 8, offset: 0, layer: 1, vel: 0.3 }));
  parts.push(bass(BATTLE, { offset: 0, layer: 1, vel: 0.65 }));
  parts.push(arp(BATTLE, [null, 4, null, 3, null, 4, null, 2], { offset: 0, vel: 0.5, layer: 1 }));
  // layer 2: the final rounds — the lead line and brass stabs on bars 1, 3, 5, 7.
  parts.push(melody(BATTLE_LEAD, 'lead', { offset: 0, vel: 0.8, layer: 2 }));
  parts.push(stabs(BATTLE, 'brass', [[0, 0.6], [8, 0.6], [16, 0.6], [24, 0.6], [30, 0.5], [31, 0.5]], { offset: 0, vel: 0.5, layer: 2 }));
  return { name: 'battle', bpm: 108, beats: 32, loop: true, gain: 0.28, events: merge(parts) };
}

export function victory() {
  const parts = [];
  parts.push(melody('D5:.5 D5:.5 D5 A5 D6:2 | r:4 | r:4', 'brass', { offset: 0, vel: 0.75 }));
  parts.push(melody('D4:.5 D4:.5 D4 A4 D5:2', 'brass', { offset: 0, vel: 0.5 }));
  parts.push(pads('D4:4 G4:2 A4:2 D4:4', 'brass', { offset: 0, vel: 0.4 }));
  parts.push(drums('snare', 'rrrrrrrrrrrrrrro|x---x---x-rrx-x-|x---x-x-rrrrrro-', { offset: 0, vel: 0.7 }));
  parts.push(drums('cymbal', 'x---------------|----------------|x---------------', { offset: 0, vel: 0.6 }));
  parts.push(timpani('D4:4 G4:2 A4:2 D4:4', [0, 2], { offset: 0, vel: 0.85 }));
  return { name: 'victory', bpm: 104, beats: 12, loop: false, gain: 0.36, events: merge(parts), then: { scene: 'theme', gain: 0.34, startBeat: 16 } };
}

export function defeat() {
  const parts = [];
  parts.push(pads('Dm:4 Bb:4 Asus:2 Am:2', 'brassDark', { offset: 0, vel: 0.5 }));
  parts.push(melody('F5:2 E5:2 | D5:2 C5:2 | Bb4:2 A4:2', 'brassDark', { offset: 0, vel: 0.55, legato: 0.98 }));
  parts.push(timpani('Dm:4 Bb:4 Am:4', [0], { offset: 0, vel: 0.6 }));
  return { name: 'defeat', bpm: 72, beats: 12, loop: false, gain: 0.26, events: merge(parts), then: { scene: 'placement', gain: 0.07 } };
}

export const SCENES = { theme, placement, battle, victory, defeat };

// ---------------------------------------------------------------- engine ---

const LOOKAHEAD_S = 0.3;
const TICK_MS = 40;
const SCHEDULED_KEEP = 96;

class Music {
  constructor() {
    this.enabled = true; // the Music setting; app.js loads and persists it
    this.gestured = false; // a user gesture has happened (start() was called)
    this.started = false; // the engine is up: a gesture happened with music on
    this.ctx = null;
    this.master = null;
    this.duckGain = null;
    this.noiseBuf = null;
    this.scene = null; // the name asked for (even before start)
    this.playing = null; // { def, bus, startedAt, cursor, loopStart, timer, gain }
    this.layer = 0;
    this.ducked = false;
    this.sonarActive = false;
    this.stats = { nodes: 0, notes: 0, violations: 0, duckSamples: 0, scenes: 0 };
    this.scheduled = []; // the last SCHEDULED_KEEP notes: { t, i, m, scene }
    this.log = []; // { at, event, ... }
    this.compiled = {};
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stopScene(0.05);
        else if (this.started && this.scene) this.startScene(this.scene);
      });
    }
  }

  note(event, detail) { this.log.push({ at: Date.now(), event, ...detail }); if (this.log.length > 200) this.log.shift(); }

  /** The one place a node is made, so the count is honest. */
  mk(kind, ...args) {
    const n = this.ctx[`create${kind}`](...args);
    this.stats.nodes += 1;
    return n;
  }

  def(name) {
    if (!this.compiled[name]) this.compiled[name] = SCENES[name]();
    return this.compiled[name];
  }

  /** First user gesture: take the shared context and start the scene asked for. */
  start() {
    this.gestured = true; // so MUSIC switched on later needs no second tap
    if (!SOUND || !this.enabled) return false;
    if (!this.ctx) {
      const c = audioContext();
      if (!c) return false;
      this.ctx = c;
      this.master = this.mk('Gain');
      this.duckGain = this.mk('Gain');
      this.master.gain.value = 1;
      this.duckGain.gain.value = this.sonarActive ? 0 : 1;
      this.master.connect(this.duckGain).connect(c.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.started) { this.started = true; this.note('start', { scene: this.scene }); }
    if (this.scene && !this.playing) this.startScene(this.scene);
    return true;
  }

  setEnabled(on) {
    on = !!on;
    if (on === this.enabled) return;
    this.enabled = on;
    this.note('enabled', { on });
    if (!on) this.stopScene(0.12);
    else if (this.gestured && this.scene) this.start();
  }

  /** The app's state moved: menu | placement | battle | victory | defeat | null. Same scene twice is a no-op. */
  setScene(name, { layer = null, delay = 0 } = {}) {
    if (name === 'menu') name = 'theme';
    if (layer !== null) this.layer = layer;
    if (name === this.scene) return;
    this.scene = name;
    this.note('scene', { scene: name, layer: this.layer });
    if (!this.started || !this.enabled || !SOUND) return;
    if (!name) { this.stopScene(0.12); return; }
    this.startScene(name, { delay });
  }

  /** Battle heat: layers only climb within a match (resetLayer at a new match). */
  setLayer(n) {
    if (n <= this.layer) return;
    this.layer = n;
    this.note('layer', { layer: n, scene: this.scene });
  }

  resetLayer() { this.layer = 0; }

  /** The chirp is sacred: exactly zero under every listen window and every chirp. */
  duck(active) {
    active = !!active;
    this.sonarActive = active;
    if (active === this.ducked) return;
    this.ducked = active;
    this.note('duck', { active });
    if (!this.duckGain) return;
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    if (active) {
      g.setValueAtTime(0, now);
      g.value = 0;
    } else {
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(1, now + 0.35);
    }
  }

  gainValue() { return this.duckGain ? this.duckGain.gain.value : 0; }

  state() {
    return {
      enabled: this.enabled && SOUND, started: this.started, scene: this.scene, playing: this.playing ? this.playing.def.name : null,
      layer: this.layer, ducked: this.ducked, gain: this.gainValue(), contextState: this.ctx ? this.ctx.state : null,
      stats: { ...this.stats }, scheduled: this.scheduled.slice(), log: this.log.slice(),
    };
  }

  // --- scenes -----------------------------------------------------------

  startScene(name, { delay = 0, gain = null, startBeat = 0 } = {}) {
    const def = this.def(name);
    this.stopScene(0.12);
    const c = this.ctx;
    const bus = this.mk('Gain');
    const target = gain === null ? def.gain : gain;
    const t0 = c.currentTime + 0.08 + delay;
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.exponentialRampToValueAtTime(target, t0 + 0.05);
    bus.connect(this.master);
    const leadDelay = this.mk('Delay', 1.0);
    leadDelay.delayTime.value = (60 / def.bpm) * 0.75;
    const leadFb = this.mk('Gain');
    leadFb.gain.value = 0.28;
    const leadWet = this.mk('Gain');
    leadWet.gain.value = 0.35;
    leadDelay.connect(leadFb).connect(leadDelay);
    leadDelay.connect(leadWet).connect(bus);
    const p = { def, bus, leadDelay, gain: target, secPerBeat: 60 / def.bpm, loopStart: t0 - startBeat * (60 / def.bpm), cursor: 0, sources: [], timer: null, done: false };
    // Skip the events before startBeat on the first pass.
    while (p.cursor < def.events.length && def.events[p.cursor].b < startBeat) p.cursor += 1;
    p.timer = setInterval(() => this.tick(), TICK_MS);
    this.playing = p;
    this.stats.scenes += 1;
    this.tick();
  }

  stopScene(fade = 0.12) {
    const p = this.playing;
    if (!p) return;
    clearInterval(p.timer);
    const c = this.ctx;
    const now = c.currentTime;
    p.bus.gain.cancelScheduledValues(now);
    p.bus.gain.setValueAtTime(Math.max(0.0001, p.bus.gain.value), now);
    p.bus.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    for (const s of p.sources) { try { s.stop(now + fade + 0.02); } catch { /* already stopped */ } }
    setTimeout(() => { try { p.bus.disconnect(); p.leadDelay.disconnect(); } catch { /* fine */ } }, (fade + 0.1) * 1000);
    this.playing = null;
  }

  tick() {
    const p = this.playing;
    const c = this.ctx;
    if (!p || !c) return;
    if (this.sonarActive) {
      this.stats.duckSamples += 1;
      if (this.duckGain.gain.value !== 0) this.stats.violations += 1;
    }
    if (c.state !== 'running') return;
    const now = c.currentTime;
    const horizon = now + LOOKAHEAD_S;
    const { def } = p;
    // If the clock ran away from us (tab throttled), re-anchor so notes never pile up.
    if (p.loopStart + def.beats * p.secPerBeat < now - 1 && def.loop) {
      const loopLen = def.beats * p.secPerBeat;
      p.loopStart += Math.floor((now - p.loopStart) / loopLen) * loopLen;
      p.cursor = 0;
    }
    for (;;) {
      if (p.cursor >= def.events.length) {
        if (def.loop) { p.loopStart += def.beats * p.secPerBeat; p.cursor = 0; }
        else {
          const end = p.loopStart + def.beats * p.secPerBeat;
          if (end > horizon) break;
          if (!p.done) {
            p.done = true;
            const then = def.then;
            clearInterval(p.timer);
            if (then) {
              const wait = Math.max(0, end - now) * 1000;
              setTimeout(() => { if (this.playing === p) this.startScene(then.scene, { gain: then.gain, startBeat: then.startBeat || 0 }); }, wait);
            }
          }
          break;
        }
        if (p.cursor >= def.events.length) break; // an empty scene
      }
      const e = def.events[p.cursor];
      const t = p.loopStart + e.b * p.secPerBeat;
      if (t > horizon) break;
      p.cursor += 1;
      if (e.l > this.layer) continue;
      if (t < now - 0.05) continue; // behind: skip, never cram
      this.play(p, e, t, e.d * p.secPerBeat);
    }
  }

  // --- instruments ------------------------------------------------------

  noise() {
    if (this.noiseBuf) return this.noiseBuf;
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 0.6);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  play(p, e, t, dur) {
    const c = this.ctx;
    const out = p.bus;
    const v = e.v;
    const f = e.m === null ? 0 : hz(e.m);
    this.stats.notes += 1;
    this.scheduled.push({ t: Math.round(t * 1000) / 1000, i: e.i, m: e.m, v, scene: p.def.name, layer: e.l });
    if (this.scheduled.length > SCHEDULED_KEEP) this.scheduled.shift();
    const keep = (src, stopAt) => { src.start(t); src.stop(stopAt); p.sources.push(src); src.onended = () => { const k = p.sources.indexOf(src); if (k >= 0) p.sources.splice(k, 1); }; };
    switch (e.i) {
      case 'brass': case 'brassDark': case 'brassLow': {
        const dark = e.i !== 'brass';
        const g = this.mk('Gain');
        const lp = this.mk('BiquadFilter');
        lp.type = 'lowpass';
        lp.Q.value = 1.2;
        const peak = dark ? 900 + 900 * v : 1400 + 1800 * v;
        lp.frequency.setValueAtTime(dark ? 220 : 320, t);
        lp.frequency.exponentialRampToValueAtTime(peak, t + 0.06);
        lp.frequency.exponentialRampToValueAtTime(dark ? 500 : 900, t + Math.max(0.25, dur));
        const a = dark ? 0.08 : 0.035;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14 * v, t + a);
        g.gain.setValueAtTime(0.14 * v, t + Math.max(a, dur - 0.08));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.14);
        for (const cents of [-8, 0, 7]) {
          const o = this.mk('Oscillator');
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = cents;
          o.connect(lp);
          keep(o, t + dur + 0.2);
        }
        lp.connect(g).connect(out);
        break;
      }
      case 'lead': {
        const g = this.mk('Gain');
        const lp = this.mk('BiquadFilter');
        lp.type = 'lowpass';
        lp.frequency.value = 2600;
        lp.Q.value = 0.9;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.02);
        g.gain.setValueAtTime(0.11 * v, t + Math.max(0.02, dur - 0.05));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.16);
        const lfo = this.mk('Oscillator');
        lfo.frequency.value = 5.6;
        const lfoG = this.mk('Gain');
        lfoG.gain.setValueAtTime(0, t);
        lfoG.gain.linearRampToValueAtTime(7, t + 0.3);
        lfo.connect(lfoG);
        for (const cents of [-9, 9]) {
          const o = this.mk('Oscillator');
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = cents;
          lfoG.connect(o.detune);
          o.connect(lp);
          keep(o, t + dur + 0.2);
        }
        keep(lfo, t + dur + 0.2);
        lp.connect(g).connect(out);
        g.connect(p.leadDelay);
        break;
      }
      case 'arp': {
        const g = this.mk('Gain');
        const lp = this.mk('BiquadFilter');
        lp.type = 'lowpass';
        lp.Q.value = 2;
        lp.frequency.setValueAtTime(2600 + 1200 * v, t);
        lp.frequency.exponentialRampToValueAtTime(500, t + Math.max(0.12, dur));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09 * v, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        const o = this.mk('Oscillator');
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(lp).connect(g).connect(out);
        keep(o, t + dur + 0.08);
        break;
      }
      case 'bass': {
        const g = this.mk('Gain');
        const lp = this.mk('BiquadFilter');
        lp.type = 'lowpass';
        lp.frequency.value = 620;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.005);
        g.gain.setValueAtTime(0.16 * v, t + Math.max(0.005, dur - 0.02));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
        const o = this.mk('Oscillator');
        o.type = 'square';
        o.frequency.value = f;
        o.connect(lp).connect(g).connect(out);
        keep(o, t + dur + 0.06);
        break;
      }
      case 'kick': {
        const g = this.mk('Gain');
        const o = this.mk('Oscillator');
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g).connect(out);
        keep(o, t + 0.32);
        break;
      }
      case 'snare': {
        const src = this.mk('BufferSource');
        src.buffer = this.noise();
        const bp = this.mk('BiquadFilter');
        bp.type = 'bandpass';
        bp.frequency.value = 1700;
        bp.Q.value = 0.7;
        const g = this.mk('Gain');
        const d = e.d < 0.1 ? 0.07 : 0.15;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        src.connect(bp).connect(g).connect(out);
        keep(src, t + d + 0.02);
        const body = this.mk('Oscillator');
        body.type = 'triangle';
        body.frequency.setValueAtTime(220, t);
        body.frequency.exponentialRampToValueAtTime(150, t + 0.06);
        const bg = this.mk('Gain');
        bg.gain.setValueAtTime(0.0001, t);
        bg.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.003);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        body.connect(bg).connect(out);
        keep(body, t + 0.1);
        break;
      }
      case 'hat': {
        const src = this.mk('BufferSource');
        src.buffer = this.noise();
        const hp = this.mk('BiquadFilter');
        hp.type = 'highpass';
        hp.frequency.value = 7500;
        const g = this.mk('Gain');
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        src.connect(hp).connect(g).connect(out);
        keep(src, t + 0.06);
        break;
      }
      case 'cymbal': {
        const src = this.mk('BufferSource');
        src.buffer = this.noise();
        src.loop = true;
        const hp = this.mk('BiquadFilter');
        hp.type = 'highpass';
        hp.frequency.value = 5200;
        const g = this.mk('Gain');
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        src.connect(hp).connect(g).connect(out);
        keep(src, t + 1.65);
        break;
      }
      case 'timpani': {
        const g = this.mk('Gain');
        const o = this.mk('Oscillator');
        o.type = 'sine';
        const f0 = hz(e.m);
        o.frequency.setValueAtTime(f0 * 1.45, t);
        o.frequency.exponentialRampToValueAtTime(f0, t + 0.08);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g).connect(out);
        keep(o, t + 1.15);
        const skin = this.mk('BufferSource');
        skin.buffer = this.noise();
        const lp = this.mk('BiquadFilter');
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        const sg = this.mk('Gain');
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.14 * v, t + 0.003);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        skin.connect(lp).connect(sg).connect(out);
        keep(skin, t + 0.08);
        break;
      }
      default:
        break;
    }
  }
}

export const music = new Music();
