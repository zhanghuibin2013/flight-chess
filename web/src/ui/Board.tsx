import React from 'react';
import { useStore } from '../state/store';
import type { Color, Cell } from '@fkzz/shared';

const COLOR_FILL: Record<Color, string> = {
  red: '#e53935', yellow: '#fdd835', blue: '#1e88e5', green: '#43a047',
};
const COLOR_STROKE: Record<Color, string> = {
  red: '#b71c1c', yellow: '#f9a825', blue: '#0d47a1', green: '#1b5e20',
};

const SIZE = 720;
// Outer margin around the play area where per-color arsenal badges sit
// (so they never overlap ring cells regardless of view rotation).
const MARGIN = 90;

// View rotation per seat: each player sees their own takeoff at the canonical
// bottom-left position. The server lays out colors clockwise on screen
// (red BL, yellow TL, blue TR, green BR), so the view rotation must be the
// INVERSE (screen-CCW about (0.5, 0.5)) to bring each color's takeoff back
// to the bottom-left for that player.
const VIEW_ROT: Record<Color, number> = { red: 0, yellow: 1, blue: 2, green: 3 };

function rotateView(p: { x: number; y: number }, k: number): { x: number; y: number } {
  let { x, y } = p;
  for (let i = 0; i < k; i++) {
    const nx = y;
    const ny = 1 - x;
    x = nx; y = ny;
  }
  return { x, y };
}

export default function Board() {
  const board = useStore(s => s.board)!;
  const state = useStore(s => s.state)!;
  const mySeat = useStore(s => s.mySeat()) as Color | null;

  // If we're a spectator (no seat), use the canonical red view.
  const k = mySeat ? VIEW_ROT[mySeat] : 0;

  return (
    <svg className="board" viewBox={`${-MARGIN} ${-MARGIN} ${SIZE + 2 * MARGIN} ${SIZE + 2 * MARGIN}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {/* Frame */}
      <rect x="0" y="0" width={SIZE} height={SIZE} fill="#fafafa" rx="8" />

      {/* Defs: per-color cross-hatch pattern used to mark currently-protected
          radar-zone cells. */}
      <defs>
        {/* Dense cross-hatch pattern (X-grid) per color — used as fill on
            an overlay rect drawn over each currently-protected radar-zone
            cell. Tile size 5 px gives a tight, clearly-visible grid. */}
        {(['red','yellow','blue','green'] as Color[]).map(c => (
          <pattern
            key={`hatch-${c}`}
            id={`adiz-hatch-${c}`}
            patternUnits="userSpaceOnUse"
            width={5}
            height={5}
          >
            <path
              d="M0,5 L5,0 M0,0 L5,5"
              stroke={COLOR_STROKE[c]}
              strokeWidth={0.9}
              strokeOpacity={0.55}
            />
          </pattern>
        ))}
      </defs>

      {/* Cells */}
      {board.cells.map(c => <CellNode key={c.id} cell={c} k={k} />)}

      {/* ADIZ cell highlight: overlay a cross-hatch grid on every currently
          protected radar-zone cell. The number of marked cells scales with
          radar count via radarZoneSize():
          • 1–2 radars → just the takeoff cell.
          • 3–4 radars → takeoff + the two flanking cells.
          • 5–6 radars → reach the ±2 cells.
          • 7+ radars  → reach the ±3 cells. */}
      {(['red','yellow','blue','green'] as Color[]).map(c => {
        const radars = state.hands[c].radars;
        if (radars <= 0) return null;
        const zoneSize = radarZoneSize(radars);
        const zoneCellIds = board.paths[c].radarZone.slice(0, zoneSize);
        if (zoneCellIds.length === 0) return null;
        const side = 30;
        return (
          <g key={`adiz-hatch-${c}`} pointerEvents="none">
            {zoneCellIds.map(cellId => {
              const cell = board.cells.find(cc => cc.id === cellId);
              if (!cell) return null;
              const rp = rotateView({ x: cell.x, y: cell.y }, k);
              const cx = rp.x * SIZE;
              const cy = rp.y * SIZE;
              return (
                <rect
                  key={cellId}
                  x={cx - side / 2}
                  y={cy - side / 2}
                  width={side}
                  height={side}
                  rx={4}
                  ry={4}
                  fill={`url(#adiz-hatch-${c})`}
                />
              );
            })}
          </g>
        );
      })}

      {/* Shortcut connectors: animated dashed line indicating the
          highway path between entry and exit. */}
      {board.cells
        .filter(c => c.kind === 'shortcutEntry' && c.shortcutPair !== undefined && c.color)
        .map(entry => {
          const exit = board.cells.find(c => c.id === entry.shortcutPair);
          if (!exit) return null;
          const r1 = rotateView({ x: entry.x, y: entry.y }, k);
          const r2 = rotateView({ x: exit.x, y: exit.y }, k);
          return (
            <line
              key={`shortcut-${entry.id}`}
              className="shortcut-flow"
              x1={r1.x * SIZE}
              y1={r1.y * SIZE}
              x2={r2.x * SIZE}
              y2={r2.y * SIZE}
              stroke={COLOR_STROKE[entry.color!]}
              strokeWidth={2.5}
              strokeDasharray="8 5"
              opacity={0.85}
              pointerEvents="none"
            />
          );
        })}

      {/* Hangars */}
      {(['red','yellow','blue','green'] as Color[]).map(c => (
        <HangarBox key={c} color={c} k={k} />
      ))}

      {/* Per-color player nameplate (avatar + nickname) above the hangar. */}
      {(['red','yellow','blue','green'] as Color[]).map(c => (
        <PlayerBadge key={`pb-${c}`} color={c} k={k} />
      ))}

      {/* Per-color arsenal badges (visible to everyone), placed next to each hangar */}
      {(['red','yellow','blue','green'] as Color[]).map(c => (
        <ArsenalBadge key={`badge-${c}`} color={c} k={k} />
      ))}

      {/* Hover-preview move curve: shown when the user hovers a movable plane
          button. Curves from current cell to the cell that would be reached
          after walking `roll` steps (with bounce-back at home). */}
      <MovePreview k={k} />

      {/* Planes */}
      {(['red','yellow','blue','green'] as Color[]).flatMap(c =>
        state.planes[c].map(p => <PlaneNode key={`${c}-${p.index}`} color={c} planeIdx={p.index} k={k} />)
      )}
    </svg>
  );
}

/** Mirrors server's radarZoneSize: how many zone cells a given radar count activates. */
function radarZoneSize(radars: number): number {
  if (radars <= 0) return 0;
  if (radars <= 2) return 1;
  if (radars <= 4) return 3;
  if (radars <= 6) return 5;
  return 7;
}

function CellNode({ cell, k }: { cell: Cell; k: number }) {
  const r = rotateView({ x: cell.x, y: cell.y }, k);
  const x = r.x * SIZE;
  const y = r.y * SIZE;
  const side = 30;
  const fill = cell.color ? COLOR_FILL[cell.color] : '#ffffff';
  const stroke = cell.color ? COLOR_STROKE[cell.color] : '#9e9e9e';

  // Highway entry/exit get larger, more iconic glyphs that read clearly
  // alongside the animated dashed connector.
  let icon: string | null = null;
  let iconSize = 14;
  let iconDy = 5;
  if (cell.kind === 'missileFactory') { icon = '🚀'; iconSize = 17; iconDy = 6; }
  else if (cell.kind === 'radarFactory') icon = '📡';
  else if (cell.kind === 'library') icon = '?';
  else if (cell.kind === 'shortcutEntry') { icon = '🛣'; iconSize = 18; iconDy = 6; }
  else if (cell.kind === 'shortcutExit')  { icon = '🏁'; iconSize = 18; iconDy = 6; }
  else if (cell.kind === 'home') icon = '★';
  else if (cell.kind === 'takeoff') icon = '▲';

  // Highlight the highway endpoints with a thicker, slightly larger frame
  // so they pop visually as "special infrastructure" cells.
  const isHighway = cell.kind === 'shortcutEntry' || cell.kind === 'shortcutExit';
  const cellSide = isHighway ? side + 4 : side;
  const cellStrokeW = isHighway ? 3 : 2;

  return (
    <g>
      <rect
        x={x - cellSide / 2}
        y={y - cellSide / 2}
        width={cellSide}
        height={cellSide}
        rx={isHighway ? 8 : 4}
        fill={fill}
        stroke={stroke}
        strokeWidth={cellStrokeW}
      />
      {isHighway && (
        // Inner glow ring to make highway endpoints stand out.
        <rect
          x={x - cellSide / 2 + 3}
          y={y - cellSide / 2 + 3}
          width={cellSide - 6}
          height={cellSide - 6}
          rx={5}
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
          opacity={0.8}
          pointerEvents="none"
        />
      )}
      {icon && (
        <text x={x} y={y + iconDy} textAnchor="middle" fontSize={iconSize} fill="#212121">{icon}</text>
      )}
    </g>
  );
}

function HangarBox({ color, k }: { color: Color; k: number }) {
  const board = useStore(s => s.board)!;
  const slots = board.paths[color].hangar;
  // Compute bounding box of (rotated) slot positions and draw ONE outlined
  // hangar rectangle surrounding all 4 slots, in the corner outside the ring.
  const rotated = slots.map(p => rotateView(p, k));
  const xs = rotated.map(p => p.x);
  const ys = rotated.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 14;
  return (
    <rect
      x={minX * SIZE - pad}
      y={minY * SIZE - pad}
      width={(maxX - minX) * SIZE + 2 * pad}
      height={(maxY - minY) * SIZE + 2 * pad}
      rx={6}
      fill={COLOR_FILL[color]} opacity={0.18}
      stroke={COLOR_STROKE[color]} strokeWidth={1.5}
    />
  );
}

// Canonical anchor (red's base) for the per-color arsenal badge: in the
// OUTER MARGIN below red's bottom-left hangar — entirely outside the play
// frame. Rotated per color (server-side) so each color's badge ends up in
// its own outer-margin strip and view rotation keeps own badge at bottom.
const CANONICAL_BADGE: { x: number; y: number } = { x: 0.10, y: 1.07 };
function rotateColorAnchor(p: { x: number; y: number }, k: number): { x: number; y: number } {
  let { x, y } = p;
  for (let i = 0; i < k; i++) {
    const nx = 1 - y;
    const ny = x;
    x = nx; y = ny;
  }
  return { x, y };
}
const COLOR_ROT_SERVER: Record<Color, number> = { red: 0, yellow: 1, blue: 2, green: 3 };

function ArsenalBadge({ color, k }: { color: Color; k: number }) {
  const state = useStore(s => s.state)!;
  const hand = state.hands[color];
  const anchorServer = rotateColorAnchor(CANONICAL_BADGE, COLOR_ROT_SERVER[color]);
  const r = rotateView(anchorServer, k);
  const cx = r.x * SIZE;
  const cy = r.y * SIZE;
  const w = 70;
  const h = 22;
  return (
    <g pointerEvents="none">
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={4}
        fill="#ffffff"
        opacity={0.95}
        stroke={COLOR_STROKE[color]}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="12"
        fill={COLOR_STROKE[color]}
        fontWeight={700}
      >
        📡{hand.radars} 🚀{hand.missiles.length}
      </text>
    </g>
  );
}

// Canonical anchor (red's base) for the player nameplate. The arsenal badge
// lives in the BOTTOM outer-margin near the left corner; we place the
// nameplate in the perpendicular LEFT outer-margin near the bottom corner so
// the two form an L-shape around each color's hangar without ever
// overlapping. Critical: the offset must be along a DIFFERENT axis from the
// arsenal's offset, otherwise rotation (yellow/green) collapses them onto
// the same line.
const CANONICAL_PLAYER_BADGE: { x: number; y: number } = { x: -0.07, y: 0.95 };

function PlayerBadge({ color, k }: { color: Color; k: number }) {
  const room = useStore(s => s.room);
  if (!room) return null;
  const seat = room.seats.find(s => s.color === color);
  // Don't render an empty placeholder for unfilled seats.
  if (!seat?.player) return null;
  const player = seat.player;

  const anchorServer = rotateColorAnchor(CANONICAL_PLAYER_BADGE, COLOR_ROT_SERVER[color]);
  const r = rotateView(anchorServer, k);
  const cx = r.x * SIZE;
  const cy = r.y * SIZE;

  // Truncate long nicknames so the badge stays compact and fits within
  // the 90-px outer margin (same constraint applies in every rotation).
  const fullName = player.nickname || '';
  const name = fullName.length > 7 ? fullName.slice(0, 6) + '…' : fullName;
  const avatar = player.avatar || '✈️';
  const offline = !player.connected;

  // Width capped at 78 so it fits the 90-px outer margin in every rotation
  // (with a small safety gap from the viewBox edge).
  const w = Math.min(78, Math.max(64, 28 + name.length * 9));
  const h = 22;

  return (
    <g pointerEvents="none">
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={5}
        fill="#ffffff"
        opacity={offline ? 0.7 : 0.96}
        stroke={COLOR_STROKE[color]}
        strokeWidth={1.5}
      />
      {/* Avatar circle on the left. */}
      <circle
        cx={cx - w / 2 + 12}
        cy={cy}
        r={8}
        fill={COLOR_FILL[color]}
        opacity={0.25}
        stroke={COLOR_STROKE[color]}
        strokeWidth={1.2}
      />
      <text
        x={cx - w / 2 + 12}
        y={cy + 4}
        textAnchor="middle"
        fontSize="12"
      >
        {avatar}
      </text>
      {/* Nickname. */}
      <text
        x={cx - w / 2 + 24}
        y={cy + 4}
        fontSize="11"
        fill={COLOR_STROKE[color]}
        fontWeight={700}
      >
        {name}{offline ? ' ⚠' : ''}
      </text>
    </g>
  );
}

const PATH_LEN_TO_HOME = 73;
const LANDING_START_STEP = 68;

/** Plane's current screen position (matches PlaneNode's geometry, no stack fan). */
function planeScreenPos(
  board: NonNullable<ReturnType<typeof useStore.getState>['board']>,
  state: NonNullable<ReturnType<typeof useStore.getState>['state']>,
  color: Color,
  planeIdx: number,
  k: number,
): { x: number; y: number } | null {
  const p = state.planes[color][planeIdx];
  if (!p) return null;
  if (p.state === 'hangar') {
    const slot = board.paths[color].hangar[planeIdx]!;
    const r = rotateView(slot, k);
    return { x: r.x * SIZE, y: r.y * SIZE };
  }
  if (p.state === 'home') {
    const home = board.cells.find(c => c.id === board.paths[color].home)!;
    const r = rotateView({ x: home.x, y: home.y }, k);
    return { x: r.x * SIZE, y: r.y * SIZE };
  }
  if (p.cellId === undefined) return null;
  const cell = board.cells.find(c => c.id === p.cellId);
  if (!cell) return null;
  const r = rotateView({ x: cell.x, y: cell.y }, k);
  return { x: r.x * SIZE, y: r.y * SIZE };
}

/** Return cellId at `color`'s path progress (no jump/shortcut resolution). */
function pathCellAt(
  board: NonNullable<ReturnType<typeof useStore.getState>['board']>,
  color: Color, progress: number,
): number {
  const path = board.paths[color];
  if (progress >= PATH_LEN_TO_HOME) return path.home;
  if (progress >= LANDING_START_STEP) return path.landing[progress - LANDING_START_STEP]!;
  return path.ring[progress]!;
}

function MovePreview({ k }: { k: number }) {
  const board = useStore(s => s.board);
  const state = useStore(s => s.state);
  const mySeat = useStore(s => s.mySeat()) as Color | null;
  const myPrompt = useStore(s => s.myPrompt());
  const hoverIdx = useStore(s => s.hoverPlaneIdx);

  if (!board || !state || !mySeat || hoverIdx === null) return null;
  if (myPrompt?.kind !== 'move') return null;
  if (!myPrompt.planes.includes(hoverIdx)) return null;

  const roll = myPrompt.roll;
  const plane = state.planes[mySeat][hoverIdx];
  if (!plane || plane.state !== 'onBoard') return null;
  const fromProgress = plane.progress ?? 0;
  // Bounce-back at home.
  let target = fromProgress + roll;
  if (target > PATH_LEN_TO_HOME) target = PATH_LEN_TO_HOME - (target - PATH_LEN_TO_HOME);
  if (target < 0) target = 0;

  // Resolve auto-shortcut for visual preview if destination is own shortcut entry.
  let destProgress = target;
  let destCellId = pathCellAt(board, mySeat, destProgress);
  const destCell = board.cells.find(c => c.id === destCellId);
  if (destCell?.kind === 'shortcutEntry' && destCell.color === mySeat && destCell.shortcutPair !== undefined) {
    destCellId = destCell.shortcutPair;
    // Find the progress index of the exit cell on our path.
    const ringExit = board.paths[mySeat].ring.findIndex(id => id === destCellId);
    if (ringExit >= 0) destProgress = ringExit;
  }

  const from = planeScreenPos(board, state, mySeat, hoverIdx, k);
  const destCellObj = board.cells.find(c => c.id === destCellId);
  if (!from || !destCellObj) return null;
  const dr = rotateView({ x: destCellObj.x, y: destCellObj.y }, k);
  const to = { x: dr.x * SIZE, y: dr.y * SIZE };

  // Build a quadratic curve arcing away from the board center for visibility.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const cx0 = SIZE / 2, cy0 = SIZE / 2;
  const dx = midX - cx0, dy = midY - cy0;
  const len = Math.hypot(dx, dy) || 1;
  const bow = 60; // px arc height outward from board center
  const ctrlX = midX + (dx / len) * bow;
  const ctrlY = midY + (dy / len) * bow;
  const stroke = COLOR_STROKE[mySeat];
  const arrowId = 'preview-arrow';

  return (
    <g pointerEvents="none" className="move-preview">
      <defs>
        <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
        </marker>
      </defs>
      <path
        d={`M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`}
        fill="none"
        stroke={stroke}
        strokeWidth={3}
        strokeDasharray="6 4"
        opacity={0.85}
        markerEnd={`url(#${arrowId})`}
      />
      <circle cx={to.x} cy={to.y} r={14} fill={stroke} opacity={0.18} />
    </g>
  );
}

function PlaneNode({ color, planeIdx, k }: { color: Color; planeIdx: number; k: number }) {
  const board = useStore(s => s.board)!;
  const state = useStore(s => s.state)!;
  const p = state.planes[color][planeIdx]!;

  let cx: number, cy: number;
  let inHangar = false;
  if (p.state === 'hangar') {
    const slot = board.paths[color].hangar[planeIdx]!;
    const r = rotateView(slot, k);
    cx = r.x * SIZE; cy = r.y * SIZE;
    inHangar = true;
  } else if (p.state === 'home') {
    const home = board.cells.find(c => c.id === board.paths[color].home)!;
    const r = rotateView({ x: home.x, y: home.y }, k);
    cx = r.x * SIZE; cy = r.y * SIZE;
  } else {
    if (p.cellId === undefined) return null;
    const cell = board.cells.find(c => c.id === p.cellId)!;
    // Spread stacked planes.
    const stackOnCell = (Object.keys(state.planes) as Color[])
      .flatMap(c => state.planes[c].filter(pp => pp.state === 'onBoard' && pp.cellId === p.cellId).map(pp => ({c, idx: pp.index})));
    const myIdxInStack = stackOnCell.findIndex(s => s.c === color && s.idx === planeIdx);
    const fanX = (myIdxInStack - (stackOnCell.length - 1) / 2) * 6;
    const r = rotateView({ x: cell.x, y: cell.y }, k);
    cx = r.x * SIZE + fanX;
    cy = r.y * SIZE;
  }

  // Hangar chips are smaller & flatter; on-board planes use the full circle.
  const radius = inHangar ? 10 : 9;
  const fontSize = inHangar ? 11 : 9;
  return (
    <g className="plane" style={{ transform: `translate(${cx}px, ${cy}px)`, transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}>
      <circle cx={0} cy={0} r={radius} fill={COLOR_FILL[color]} stroke="#212121" strokeWidth={1.5} />
      <text x={0} y={fontSize / 3} textAnchor="middle" fontSize={fontSize} fill="#fff" fontWeight={700}>{planeIdx + 1}</text>
    </g>
  );
}
