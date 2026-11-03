// Modem Warfare — the fleet's artwork (SHIPS build).
//
// Top-down naval ships drawn as inline SVG, one segment per board cell, so a
// ship of any length and either orientation reads as one continuous hull
// across its cells. Everything is drawn in code: no image asset, nothing to
// fetch, nothing new for the precache to carry but this module.
//
// The scheme:
//   - Every segment is drawn in a 100×100 box, horizontal, bow to the right
//     (+x). The hull spans the full box in the ship axis (x 0..100) so the
//     segments join across the grid gap, and is inset in the cross axis
//     (y 50±hw) so the water shows beside it. Nothing is drawn outside the
//     box: the artwork lives inside the ship's own cells (cell-exact honesty).
//   - The hull outline is drawn as open edge lines, never as a stroked closed
//     shape, so no segment has an end line at the seam: the deck edges run
//     straight on into the next cell and the silhouette is one vessel.
//   - A vertical ship is the same drawing rotated 90° clockwise about the
//     box centre: the bow (the last cell, which is the bottom one) points down.
//   - The four ships are four classes, keyed by fleet position: 0 the capital
//     ship (a battleship: twin turrets fore and aft, two funnels, the biggest
//     bridge), 1 a cruiser (helipad aft, one funnel, boats), 2 a destroyer
//     (raked funnel, depth-charge racks, one gun), 3 a corvette (narrowest,
//     wheelhouse, torpedo tubes, one light gun). Their hull widths differ so
//     they tell apart at mini-board size where no fitting is legible.
//   - Colour is all CSS (classes on the SVG parts), so the hit, sunk and
//     sinking states recolour the art from app.css without redrawing.
//
// The fleet strip uses the same segments laid end to end in one SVG, so the
// strip's ship is the board's ship in miniature, and each segment keeps a
// .fleet__cell group with its cell index for the reveal's hit marking.

const CLASSES = [
  { key: 'battleship', hw: 29 },
  { key: 'cruiser', hw: 26 },
  { key: 'destroyer', hw: 23 },
  { key: 'corvette', hw: 20 },
];

const r1 = (n) => String(Math.round(n * 10) / 10);

// ------------------------------------------------------------- the hull ---

/** The hull's filled shape for a segment role, at half-width hw. */
function hullFill(role, hw) {
  const T = 50 - hw; const B = 50 + hw;
  if (role === 'bow') return `M0,${T} H40 C68,${T} 86,${r1(T + hw * 0.55)} 96,50 C86,${r1(B - hw * 0.55)} 68,${B} 40,${B} H0 Z`;
  if (role === 'stern') return `M100,${T} H16 Q4,${T} 4,${T + 10} V${B - 10} Q4,${B} 16,${B} H100 Z`;
  return `M0,${T} H100 V${B} H0 Z`;
}

/** The hull's outline: open edge paths with no line across the seam. */
function hullEdges(role, hw) {
  const T = 50 - hw; const B = 50 + hw;
  if (role === 'bow') return `M0,${T} H40 C68,${T} 86,${r1(T + hw * 0.55)} 96,50 C86,${r1(B - hw * 0.55)} 68,${B} 40,${B} H0`;
  if (role === 'stern') return `M100,${T} H16 Q4,${T} 4,${T + 10} V${B - 10} Q4,${B} 16,${B} H100`;
  return `M0,${T} H100 M0,${B} H100`;
}

/** The deck: the hull inset by the side band, same construction. */
function deckFill(role, hw) {
  const d = hw - 5; const T = 50 - d; const B = 50 + d;
  if (role === 'bow') return `M0,${T} H38 C64,${T} 80,${r1(T + d * 0.55)} 90,50 C80,${r1(B - d * 0.55)} 64,${B} 38,${B} H0 Z`;
  if (role === 'stern') return `M100,${T} H17 Q9,${T} 9,${T + 8} V${B - 8} Q9,${B} 17,${B} H100 Z`;
  return `M0,${T} H100 V${B} H0 Z`;
}

// ------------------------------------------------------------ fittings ---

const line = (x1, y1, x2, y2, cls = 'sh-line') => `<path class="${cls}" d="M${r1(x1)},${r1(y1)} L${r1(x2)},${r1(y2)}"/>`;
const circle = (cx, cy, r, cls) => `<circle class="${cls}" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"/>`;
const rect = (x, y, w, h, cls, rx = 2) => `<rect class="${cls}" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}"/>`;
const ellipse = (cx, cy, rx, ry, cls) => `<ellipse class="${cls}" cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}"/>`;

/** Transverse deck plating lines at the given x positions. */
function plating(hw, xs) {
  const T = 50 - hw + 8; const B = 50 + hw - 8;
  return xs.map((x) => line(x, T, x, B)).join('');
}

/** A gun turret: a round barbette and one or two barrels pointing fore (+1) or aft (−1). */
function turret(cx, cy, r, dir, barrels, len) {
  const offs = barrels === 2 ? [-3.2, 3.2] : [0];
  const x0 = cx + dir * (r - 2); const x1 = cx + dir * (r + len);
  return offs.map((o) => line(x0, cy + o, x1, cy + o, 'sh-barrel')).join('') + circle(cx, cy, r, 'sh-turret') + circle(cx, cy, r * 0.35, 'sh-turret-cap');
}

/** A funnel: a dark stack with a signal-amber cap ring. */
function funnel(cx, cy, r, raked = false) {
  return (raked ? ellipse(cx, cy, r * 1.25, r, 'sh-funnel') : circle(cx, cy, r, 'sh-funnel')) + circle(cx, cy, r * 0.5, 'sh-funnel-cap');
}

/** A bridge: the superstructure block, the tower on it, a windows line on its forward face, a mast. */
function bridge(x, y, w, h, tower) {
  const [tx, ty, tw, th] = tower;
  return rect(x, y, w, h, 'sh-super', 3) + rect(tx, ty, tw, th, 'sh-super-top', 2)
    + line(tx + tw - 2, ty + 3, tx + tw - 2, ty + th - 3, 'sh-window') + circle(tx + tw * 0.4, ty + th / 2, 2.4, 'sh-mast');
}

/** The forecastle: deck-edge lines converging on the bow, a capstan, the hawse pipes. */
function forecastle(hw) {
  const T = 50 - hw; const B = 50 + hw;
  return line(56, T + 8, 88, 47) + line(56, B - 8, 88, 53) + circle(78, 50, 3, 'sh-fitting') + circle(86, 46, 1.6, 'sh-fitting') + circle(86, 54, 1.6, 'sh-fitting');
}

// ------------------------------------------------------- the classes ---
// Each class draws its fittings for a segment role. `bridgeHere` is true on
// the segment that carries the bridge (the mid nearest the bow, or the stern
// when the ship has no mids); the other mids carry the aft superstructure.

const FITTINGS = {
  battleship(role, { bridgeHere, hw }) {
    if (role === 'bow') return plating(hw, [12]) + forecastle(hw) + turret(32, 50, 12, 1, 2, 18);
    if (role === 'stern') return plating(hw, [86]) + turret(58, 50, 12, -1, 2, 22) + circle(84, 36, 3.5, 'sh-turret') + circle(84, 64, 3.5, 'sh-turret') + circle(92, 50, 2.2, 'sh-fitting');
    if (bridgeHere) return bridge(12, 33, 64, 34, [42, 38, 28, 24]) + funnel(24, 50, 9) + circle(86, 30, 3.5, 'sh-turret') + circle(86, 70, 3.5, 'sh-turret');
    return plating(hw, [10]) + rect(20, 36, 44, 28, 'sh-super', 3) + funnel(44, 50, 9) + turret(80, 32, 5, 1, 1, 9) + turret(80, 68, 5, 1, 1, 9);
  },
  cruiser(role, { bridgeHere, hw }) {
    if (role === 'bow') return plating(hw, [12]) + forecastle(hw) + turret(34, 50, 9, 1, 2, 22);
    if (role === 'stern') {
      const pad = circle(26, 50, 12, 'sh-pad') + circle(26, 50, 4.5, 'sh-pad-core');
      return pad + turret(66, 50, 9, -1, 2, 14) + (bridgeHere ? bridge(78, 36, 20, 28, [80, 40, 14, 20]) : '');
    }
    if (bridgeHere) return bridge(18, 35, 54, 30, [44, 39, 22, 22]) + funnel(28, 50, 8) + ellipse(84, 33, 7, 3, 'sh-boat') + ellipse(84, 67, 7, 3, 'sh-boat');
    return plating(hw, [20, 50, 80]) + rect(30, 38, 40, 24, 'sh-super', 3) + funnel(50, 50, 8);
  },
  destroyer(role, { bridgeHere, hw }) {
    if (role === 'bow') return plating(hw, [12]) + forecastle(hw) + turret(36, 50, 7, 1, 1, 24);
    if (role === 'stern') return rect(10, 41, 10, 5, 'sh-tube', 1) + rect(10, 54, 10, 5, 'sh-tube', 1) + funnel(28, 50, 7, true) + (bridgeHere ? bridge(40, 37, 38, 26, [54, 41, 18, 18]) : plating(hw, [60, 80]));
    if (bridgeHere) return bridge(24, 37, 44, 26, [44, 41, 18, 18]) + funnel(80, 50, 7, true);
    return plating(hw, [20, 50, 80]) + rect(34, 40, 32, 20, 'sh-super', 3);
  },
  corvette(role, { bridgeHere, hw }) {
    if (role === 'bow') return plating(hw, [12]) + forecastle(hw) + turret(40, 50, 6, 1, 1, 20);
    if (role === 'stern') return rect(14, 41, 16, 4, 'sh-tube', 1) + rect(14, 48, 16, 4, 'sh-tube', 1) + rect(14, 55, 16, 4, 'sh-tube', 1) + ellipse(36, 50, 4.5, 4, 'sh-funnel') + (bridgeHere ? bridge(44, 39, 30, 22, [56, 43, 14, 14]) : plating(hw, [60, 80]));
    if (bridgeHere) return bridge(28, 39, 30, 22, [40, 43, 14, 14]) + ellipse(74, 50, 4.5, 4, 'sh-funnel');
    return plating(hw, [20, 50, 80]) + rect(36, 42, 28, 16, 'sh-super', 3);
  },
};

export function shipClass(shipIndex) {
  return CLASSES[Math.min(Math.max(shipIndex, 0), CLASSES.length - 1)];
}

/** The segment role at position k of a ship of `size` cells. */
export function segmentRole(k, size) {
  if (size <= 1) return 'bow';
  if (k === 0) return 'stern';
  if (k === size - 1) return 'bow';
  return 'mid';
}

/** The inner markup of one segment (horizontal, bow to the right). */
export function segmentArt(shipIndex, size, k) {
  const cls = shipClass(shipIndex);
  const role = segmentRole(k, size);
  const bridgeHere = size <= 2 ? role === 'stern' : k === size - 2;
  return `<path class="sh-hull" d="${hullFill(role, cls.hw)}"/>`
    + `<path class="sh-deck" d="${deckFill(role, cls.hw)}"/>`
    + `<g class="sh-fit">${FITTINGS[cls.key](role, { bridgeHere, hw: cls.hw })}</g>`
    + `<path class="sh-edge" d="${hullEdges(role, cls.hw)}"/>`;
}

/**
 * One board cell's artwork: an SVG filling the cell, the segment for its
 * position, rotated for a vertical ship so the bow (last cell) points down.
 */
export function segmentSvg({ shipIndex, size, k, horizontal }) {
  const cls = shipClass(shipIndex);
  const role = segmentRole(k, size);
  const inner = segmentArt(shipIndex, size, k);
  return `<svg class="ship ship--${cls.key} ship--${role}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">`
    + (horizontal ? inner : `<g transform="rotate(90 50 50)">${inner}</g>`)
    + '</svg>';
}

/**
 * The fleet strip's silhouette: the whole ship, horizontal, bow right, the
 * segments laid end to end in one SVG. Each segment is a .fleet__cell group
 * carrying its cell index, so the reveal can mark a hit segment.
 */
export function shipSvg({ shipIndex, size, cellIndices = [] }) {
  const cls = shipClass(shipIndex);
  const parts = [];
  for (let k = 0; k < size; k++) {
    const idx = cellIndices[k];
    parts.push(`<g class="fleet__cell"${idx === undefined ? '' : ` data-cell="${idx}"`} transform="translate(${k * 100} 0)">${segmentArt(shipIndex, size, k)}</g>`);
  }
  return `<svg class="fleet__hull ship ship--${cls.key}" viewBox="0 0 ${size * 100} 100" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}
