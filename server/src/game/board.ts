// Board construction for 防控作战飞行棋.
//
// Layout (per the user spec):
// - 84-cell outer ring; 4 quadrants of 21 cells each.
// - Quadrant order CLOCKWISE: red, yellow, blue, green.
//   Takeoff offsets: { red: 0, yellow: 21, blue: 42, green: 63 }.
// - Cell color cycles every 4 ring positions: pos%4 == 0 → red, 1 → yellow,
//   2 → blue, 3 → green. With 21 cells per quadrant, every quadrant looks the
//   same from its owner's perspective: 21 cells starting at the owner color
//   followed by next/next-next/prev/owner repeating.
// - Within each color's own quadrant (offsets +0..+20 from own takeoff):
//     +0  → takeoff (own color)
//     +2  → missile factory (next-next color)
//     +3  → radar factory   (prev color)
//     +5  → landing entry   for the NEXT color (= that color's ring divert)
//     +10 → library         (next-next color)
//     +13 → missile factory (next color)
//     +15 → shortcut EXIT   for the PREV color (the prev color enters their
//             shortcut from their own +16 and lands here)
//     +16 → shortcut ENTRY  (own color)
//     +4 / +8 / +12 / +20  → same-color jump cells (own color)
//     other positions       → decoratively colored, no special effect
// - Each color's path:
//     ring  : 84 cells starting at own takeoff; walk 68 cells (= -16 mod 84)
//             to reach own landing entry (which sits in the PREVIOUS color's
//             quadrant at offset +5).
//     landing: 4 off-ring cells, then home.
//   Total path length = 68 + 4 + 1 = 73 (LANDING_START_STEP=68, PATH_LEN_TO_HOME=73).
// - 4-fold rotational symmetry: every color sees the same layout from its own
//   corner. Hangars + landing strips defined by rotating the canonical RED
//   layout 90°×k around the center.
// - Radar zone: up to 7 cells fanning out from the color's takeoff.

import type {
  BoardPath, BoardSnapshot, Cell, Color,
} from '@fkzz/shared';
import { COLORS } from '@fkzz/shared';

const RING_LEN = 84;
const QUADRANT_LEN = 21;

const TAKEOFF_OFFSET: Record<Color, number> = {
  red: 0,
  yellow: 21,
  blue: 42,
  green: 63,
};

// Same-color jump cells appear every 4 ring positions starting at each color's
// takeoff. Inside the owner's own quadrant the offsets are 0/4/8/12/16/20.
// Of these, +0 is the takeoff, +16 is the shortcut entry; the remaining
// {4, 8, 12, 20} are the plain jump cells.
const SAME_COLOR_STEP = 4;

// Shortcut entry/exit offsets measured from the OWNER color's takeoff.
const SHORTCUT_ENTRY_OFFSET = 16; // own quadrant
const SHORTCUT_EXIT_OFFSET  = 36; // = next-quadrant's offset +15

// Landing-strip entry on the ring (relative to the OWNER color's takeoff,
// walking forward). Equivalently: previous quadrant's offset +5.
const LANDING_ENTRY_OFFSET  = 68; // = -16 mod 84

// Special cells inside each owner's quadrant (offset → kind).
// Two missile factories per quadrant: one at +2 (next-next color) and one at
// +13 (next color). One library at +10. One radar factory at +3.
const SPECIAL_OFFSETS: Record<number, Cell['kind']> = {
  2:  'missileFactory',
  3:  'radarFactory',
  10: 'library',
  13: 'missileFactory',
};

// ---------- Geometry ----------
//
// 21 cells per side. Ring traversal walks clockwise (visually on screen,
// where SVG y increases downward) starting from red's takeoff at the
// bottom-left corner.
//
//   side 0 (left edge):   idx 0..20   — bottom → top   (red quadrant)
//   side 1 (top edge):    idx 21..41  — left → right   (yellow quadrant)
//   side 2 (right edge):  idx 42..62  — top → bottom   (blue quadrant)
//   side 3 (bottom edge): idx 63..83  — right → left   (green quadrant)

const LO = 0.08;
const HI = 0.92;

function ringPosition(idx: number): { x: number; y: number } {
  const side = Math.floor(idx / QUADRANT_LEN);
  const within = idx % QUADRANT_LEN;
  const t = within / QUADRANT_LEN; // 0..(20/21)
  switch (side) {
    case 0: return { x: LO, y: HI - (HI - LO) * t };          // left edge bottom→top
    case 1: return { x: LO + (HI - LO) * t, y: LO };          // top edge left→right
    case 2: return { x: HI, y: LO + (HI - LO) * t };          // right edge top→bottom
    default: return { x: HI - (HI - LO) * t, y: HI };         // bottom edge right→left
  }
}

// Color of any ring cell: cycle r/y/b/g every 4 positions.
function colorAtRingIndex(idx: number): Color {
  return COLORS[idx % 4]!;
}

// ---------- Hangar / landing layout (4-fold rotational symmetry) ----------
//
// Canonical layout for RED, then rotated 90°×k for yellow/blue/green
// (k = COLOR_ROT[c]) so each color's hangar + landing strip sit adjacent to
// that color's takeoff corner.
//
// Takeoffs walk visually clockwise on screen: red=bottom-left →
// yellow=top-left → blue=top-right → green=bottom-right. So we rotate red's
// canonical layout in the same visual direction (screen-CW about the
// center): (x, y) → (1 - y, x).

type Pt = { x: number; y: number };
function rotateForColor(p: Pt, k: number): Pt {
  let { x, y } = p;
  for (let i = 0; i < k; i++) {
    const nx = 1 - y;
    const ny = x;
    x = nx; y = ny;
  }
  return { x, y };
}
const COLOR_ROT: Record<Color, number> = { red: 0, yellow: 1, blue: 2, green: 3 };

// Canonical RED:
// - Takeoff at ring idx 0 = (LO, HI) ≈ (0.08, 0.92) — bottom-left corner.
// - Hangar: 4 slots in a tight 2×2 cluster tucked into the bottom-left
//   corner OUTSIDE the ring, well clear of ring cells.
// - Landing entry on the ring at idx 68 (= 0 - 16 mod 84) which sits on the
//   bottom edge near the bottom-right corner (in green's quadrant):
//   ≈ (0.72, 0.92).
// - Landing strip walks diagonally inward (up-left) from that ring point to
//   home in the bottom-left quadrant of the center.
const RED_HANGAR: Pt[] = [
  { x: 0.03, y: 0.94 }, { x: 0.07, y: 0.94 },
  { x: 0.03, y: 0.98 }, { x: 0.07, y: 0.98 },
];
// Note: red's home is offset toward red's bottom-left corner so that the
// four homes don't visually overlap at the dead center.
const RED_HOME: Pt = { x: 0.46, y: 0.54 };
// 4 landing-strip cells: from the ring entry (≈ 0.72, 0.92) diagonally
// up-left toward home (0.46, 0.54).
const RED_LANDING: Pt[] = [
  { x: 0.67, y: 0.84 },
  { x: 0.62, y: 0.76 },
  { x: 0.56, y: 0.68 },
  { x: 0.51, y: 0.60 },
];

const HANGAR_LAYOUT: Record<Color, Pt[]> = {
  red:    RED_HANGAR,
  yellow: RED_HANGAR.map(p => rotateForColor(p, COLOR_ROT.yellow)),
  blue:   RED_HANGAR.map(p => rotateForColor(p, COLOR_ROT.blue)),
  green:  RED_HANGAR.map(p => rotateForColor(p, COLOR_ROT.green)),
};

const LANDING_LAYOUT: Record<Color, { landing: Pt[]; home: Pt }> = {
  red:    { landing: RED_LANDING, home: RED_HOME },
  yellow: { landing: RED_LANDING.map(p => rotateForColor(p, 1)), home: rotateForColor(RED_HOME, 1) },
  blue:   { landing: RED_LANDING.map(p => rotateForColor(p, 2)), home: rotateForColor(RED_HOME, 2) },
  green:  { landing: RED_LANDING.map(p => rotateForColor(p, 3)), home: rotateForColor(RED_HOME, 3) },
};

// ---------- BuiltBoard ----------

export interface BuiltBoard extends BoardSnapshot {
  /** ring[ringIdx] -> cell id for the ring cell. */
  ring: number[];
  /** Map cell id -> ring index (or -1 if not on ring). */
  ringIndexOf: Map<number, number>;
  /** True when a same-color jump applies for `color` at ring index `idx`. */
  isJumpForColor(color: Color, ringIdx: number): boolean;
  /** Returns ring index after jumping (the next same-color cell of `color`). */
  nextSameColorRingIdx(color: Color, ringIdx: number): number;
  /** Look up shortcut info for a color and ring index. */
  shortcutForColor(color: Color, ringIdx: number): { exitRingIdx: number } | null;
}

export function buildBoard(): BuiltBoard {
  const cells: Cell[] = [];
  const ring: number[] = [];

  // ----- Ring cells -----
  for (let i = 0; i < RING_LEN; i++) {
    const pos = ringPosition(i);
    const cellColor = colorAtRingIndex(i); // decorative color for ALL ring cells

    let kind: Cell['kind'] = 'normal';

    // Takeoff?
    const takeoffEntry = (Object.entries(TAKEOFF_OFFSET) as [Color, number][])
      .find(([, off]) => off === i);
    if (takeoffEntry) {
      kind = 'takeoff';
    }

    // Same-color jump cell? (Only inside owner's own quadrant, not at +0 or +16.)
    if (kind === 'normal') {
      for (const c of COLORS) {
        const baseOff = TAKEOFF_OFFSET[c];
        const off = (i - baseOff + RING_LEN) % RING_LEN;
        if (off >= QUADRANT_LEN) continue;            // outside this quadrant
        if (off === 0) continue;                      // takeoff (handled above)
        if (off === SHORTCUT_ENTRY_OFFSET) continue;  // shortcut entry handled below
        if (off % SAME_COLOR_STEP === 0 && cellColor === c) {
          kind = 'jump';
        }
      }
    }

    // Special cells inside each quadrant.
    if (kind === 'normal') {
      for (const c of COLORS) {
        const baseOff = TAKEOFF_OFFSET[c];
        const off = (i - baseOff + RING_LEN) % RING_LEN;
        if (off >= QUADRANT_LEN) continue;
        const sk = SPECIAL_OFFSETS[off];
        if (sk) { kind = sk; break; }
      }
    }

    // Shortcut entry/exit (overrides 'jump' kind on owner's color cells).
    for (const c of COLORS) {
      const baseOff = TAKEOFF_OFFSET[c];
      if (i === (baseOff + SHORTCUT_ENTRY_OFFSET) % RING_LEN) { kind = 'shortcutEntry'; }
      else if (i === (baseOff + SHORTCUT_EXIT_OFFSET) % RING_LEN) { kind = 'shortcutExit'; }
    }

    const cell: Cell = {
      id: i,
      kind,
      // Always set color so the renderer can paint the visual checker pattern.
      color: cellColor,
      x: pos.x,
      y: pos.y,
    };
    cells.push(cell);
    ring.push(i);
  }

  // ----- Wire shortcut pairs -----
  for (const c of COLORS) {
    const baseOff = TAKEOFF_OFFSET[c];
    const entryId = (baseOff + SHORTCUT_ENTRY_OFFSET) % RING_LEN;
    const exitId  = (baseOff + SHORTCUT_EXIT_OFFSET)  % RING_LEN;
    cells[entryId]!.shortcutPair = exitId;
    cells[exitId]!.shortcutPair  = entryId;
  }

  // ----- Landing strip + home cells per color -----
  const paths = {} as Record<Color, BoardPath>;
  let nextId = RING_LEN;
  for (const c of COLORS) {
    const layout = LANDING_LAYOUT[c];
    const landingIds: number[] = [];
    for (let k = 0; k < 4; k++) {
      const pos = layout.landing[k]!;
      const id = nextId++;
      cells.push({ id, kind: 'landing', color: c, x: pos.x, y: pos.y });
      landingIds.push(id);
    }
    const homeId = nextId++;
    cells.push({ id: homeId, kind: 'home', color: c, x: layout.home.x, y: layout.home.y });

    // Walking order on the ring starting from this color's takeoff.
    const start = TAKEOFF_OFFSET[c];
    const colorRing: number[] = [];
    for (let k = 0; k < RING_LEN; k++) {
      colorRing.push(ring[(start + k) % RING_LEN]!);
    }

    paths[c] = {
      color: c,
      ring: colorRing,
      landing: landingIds,
      home: homeId,
      takeoff: ring[start]!,
      hangar: HANGAR_LAYOUT[c],
      radarZone: computeRadarZone(c, ring),
    };
  }

  // Sanity: landing entry on the ring (informational; not used by engine since
  // the engine diverts off the ring purely on progress thresholds).
  void LANDING_ENTRY_OFFSET;

  const ringIndexOf = new Map<number, number>();
  ring.forEach((cid, idx) => ringIndexOf.set(cid, idx));

  function isJumpForColor(color: Color, ringIdx: number): boolean {
    const cellId = ring[ringIdx]!;
    const cell = cells[cellId]!;
    if (cell.kind !== 'jump' && cell.kind !== 'shortcutEntry' && cell.kind !== 'shortcutExit') return false;
    return cell.color === color;
  }

  function nextSameColorRingIdx(color: Color, ringIdx: number): number {
    // Walk forward until we find another jump/shortcut cell of the same color
    // that belongs to this color (i.e., owner color matches).
    for (let step = 1; step < RING_LEN; step++) {
      const next = (ringIdx + step) % RING_LEN;
      const cell = cells[ring[next]!]!;
      if (cell.color === color &&
          (cell.kind === 'jump' || cell.kind === 'shortcutEntry' || cell.kind === 'shortcutExit')) {
        return next;
      }
    }
    return ringIdx;
  }

  function shortcutForColor(color: Color, ringIdx: number): { exitRingIdx: number } | null {
    const cell = cells[ring[ringIdx]!]!;
    if (cell.kind !== 'shortcutEntry') return null;
    if (cell.color !== color) return null;
    const exitCellId = cell.shortcutPair!;
    return { exitRingIdx: ringIndexOf.get(exitCellId)! };
  }

  return { cells, paths, ring, ringIndexOf, isJumpForColor, nextSameColorRingIdx, shortcutForColor };
}

// Radar-zone cells per color in priority order (closest to base first).
// We list 7 cells fanning out from the color's takeoff: the takeoff itself,
// then alternating -1, +1, -2, +2, -3, +3 along the ring. The engine uses
// a prefix of this list per the radar count: 0/1/3/5/7.
function computeRadarZone(color: Color, ring: number[]): number[] {
  const baseOff = TAKEOFF_OFFSET[color];
  const offs = [0, -1, +1, -2, +2, -3, +3];
  return offs.map(o => ring[(baseOff + o + RING_LEN) % RING_LEN]!);
}

/** How many radar-zone cells are active for a given radar count. */
export function radarZoneSize(radars: number): number {
  if (radars <= 0) return 0;
  if (radars === 1 || radars === 2) return 1;
  if (radars === 3 || radars === 4) return 3;
  if (radars === 5 || radars === 6) return 5;
  return 7;
}
