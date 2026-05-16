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

// View rotation per seat: each player sees their own takeoff at the canonical
// bottom-left position. We rotate the canonical layout CW around (0.5, 0.5)
// k times where k matches the seat's quadrant offset in the clockwise order
// red, yellow, blue, green.
const VIEW_ROT: Record<Color, number> = { red: 0, yellow: 1, blue: 2, green: 3 };

function rotateView(p: { x: number; y: number }, k: number): { x: number; y: number } {
  let { x, y } = p;
  for (let i = 0; i < k; i++) {
    const nx = 1 - y;
    const ny = x;
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
    <svg className="board" viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {/* Frame */}
      <rect x="0" y="0" width={SIZE} height={SIZE} fill="#fafafa" rx="8" />

      {/* Cells */}
      {board.cells.map(c => <CellNode key={c.id} cell={c} k={k} />)}

      {/* Hangars */}
      {(['red','yellow','blue','green'] as Color[]).map(c => (
        <HangarBox key={c} color={c} k={k} />
      ))}

      {/* Planes */}
      {(['red','yellow','blue','green'] as Color[]).flatMap(c =>
        state.planes[c].map(p => <PlaneNode key={`${c}-${p.index}`} color={c} planeIdx={p.index} k={k} />)
      )}
    </svg>
  );
}

function CellNode({ cell, k }: { cell: Cell; k: number }) {
  const r = rotateView({ x: cell.x, y: cell.y }, k);
  const x = r.x * SIZE;
  const y = r.y * SIZE;
  const side = 30;
  const fill = cell.color ? COLOR_FILL[cell.color] : '#ffffff';
  const stroke = cell.color ? COLOR_STROKE[cell.color] : '#9e9e9e';

  let icon: string | null = null;
  if (cell.kind === 'missileFactory') icon = '✈';
  else if (cell.kind === 'radarFactory') icon = '📡';
  else if (cell.kind === 'library') icon = '?';
  else if (cell.kind === 'shortcutEntry') icon = '→';
  else if (cell.kind === 'shortcutExit') icon = '↘';
  else if (cell.kind === 'home') icon = '★';
  else if (cell.kind === 'takeoff') icon = '▲';

  return (
    <g>
      <rect
        x={x - side / 2}
        y={y - side / 2}
        width={side}
        height={side}
        rx={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {icon && (
        <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fill="#212121">{icon}</text>
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
    <g className="plane">
      <circle cx={cx} cy={cy} r={radius} fill={COLOR_FILL[color]} stroke="#212121" strokeWidth={1.5} />
      <text x={cx} y={cy + fontSize / 3} textAnchor="middle" fontSize={fontSize} fill="#fff" fontWeight={700}>{planeIdx + 1}</text>
    </g>
  );
}
