// Movement & landing helpers — pure functions over board + plane state.

import type { Color, Plane } from '@fkzz/shared';
import type { BuiltBoard } from './board.js';

const RING_LEN = 84;
const LANDING_LEN = 4;
/** Total path length from takeoff (step=0) to home: 68 ring steps + 4 landing + home cell.
 * - step 0: takeoff cell (after first move plane lives at progress=1).
 * - steps 1..67: regular ring travel.
 * - steps 68..71: landing strip (4 cells).
 * - step 72+: home.
 *
 * The owner's landing entry sits at ring offset +68 from their own takeoff
 * (equivalently: previous quadrant's offset +5).
 *
 * Note: a plane that just took off sits at progress=0 (on the takeoff cell).
 *       Each die step increments progress by 1. */
export const PATH_LEN_TO_HOME = 73;
export const LANDING_START_STEP = 68;

export interface Position {
  /** Cell id where the plane currently is. */
  cellId: number;
  /** Steps walked since takeoff (0 == on takeoff cell). */
  progress: number;
  /** True when in landing strip. */
  inLanding: boolean;
  /** True when at home. */
  atHome: boolean;
}

/** Walk a plane forward by `steps` from its current progress, with bounce-back.
 * Returns the resolved position (no jump/shortcut applied yet — caller handles).
 * Does NOT mutate the plane.
 */
export function stepForward(
  board: BuiltBoard,
  color: Color,
  fromProgress: number,
  steps: number,
): { progress: number; cellId: number; bounced: boolean } {
  let target = fromProgress + steps;
  let bounced = false;
  if (target > PATH_LEN_TO_HOME) {
    const overshoot = target - PATH_LEN_TO_HOME;
    target = PATH_LEN_TO_HOME - overshoot;
    bounced = true;
  }
  if (target < 0) target = 0;
  return { progress: target, cellId: cellIdAtProgress(board, color, target), bounced };
}

/** Walk backward (used by "back N" cards). Cannot go behind takeoff (clamp at 0). */
export function stepBackward(
  board: BuiltBoard,
  color: Color,
  fromProgress: number,
  steps: number,
): { progress: number; cellId: number } {
  const p = Math.max(0, fromProgress - steps);
  return { progress: p, cellId: cellIdAtProgress(board, color, p) };
}

export function cellIdAtProgress(board: BuiltBoard, color: Color, progress: number): number {
  const path = board.paths[color];
  if (progress >= LANDING_START_STEP) {
    if (progress >= PATH_LEN_TO_HOME) return path.home;
    return path.landing[progress - LANDING_START_STEP]!;
  }
  return path.ring[progress]!;
}

/** True when the given progress sits in this color's landing strip (immune to most attacks). */
export function isInLandingStrip(progress: number): boolean {
  return progress >= LANDING_START_STEP && progress < PATH_LEN_TO_HOME;
}

/** True when at exactly the home cell. */
export function isAtHome(progress: number): boolean {
  return progress >= PATH_LEN_TO_HOME;
}

/** True when on this color's takeoff cell (used for cruise targeting). */
export function isOnTakeoff(progress: number): boolean {
  return progress === 0;
}

export interface JumpResolution {
  finalProgress: number;
  finalCellId: number;
  jumped: boolean;
  shortcutUsed: boolean;
}

/** Apply jump + shortcut chain rules to a plane that just landed at `progress`.
 *  Rules:
 *   - On a same-color jump cell (own quadrant cell, not takeoff), advance to next same-color cell.
 *     But if the plane in front of the next same-color cell is occupied by another plane
 *     (per spec "若前方遇到此情况，则不可跳跃") — we only suppress when the *target* of the
 *     jump has any plane (foreign or stacked) sitting on it. Best-effort interpretation.
 *   - On a same-color shortcut entry from a normal step, traverse to exit and ALSO jump
 *     once more from the exit (chain).
 *   - On a same-color shortcut entry reached *via prior jump*, traverse to exit only.
 */
export function resolveJumpChain(
  board: BuiltBoard,
  color: Color,
  progress: number,
  /** Whether anyone occupies the candidate jump-target cell (for the "前方遇到这机情况" suppression). */
  isCellOccupied: (cellId: number) => boolean,
): JumpResolution {
  // Only ring cells can trigger jumps/shortcuts.
  if (progress >= LANDING_START_STEP) {
    return { finalProgress: progress, finalCellId: cellIdAtProgress(board, color, progress), jumped: false, shortcutUsed: false };
  }
  const ringIdxFromProgress = (p: number) => board.ringIndexOf.get(board.paths[color].ring[p]!)!;
  const progressFromRingIdx = (ri: number) => {
    // Find offset within this color's ring (which starts at takeoff).
    const path = board.paths[color];
    for (let k = 0; k < path.ring.length; k++) {
      if (path.ring[k] === board.ring[ri]) return k;
    }
    return 0;
  };

  let curProgress = progress;
  let curRingIdx = ringIdxFromProgress(curProgress);
  let jumped = false;
  let shortcutUsed = false;

  // Check shortcut first (shortcutEntry takes priority).
  const sc = board.shortcutForColor(color, curRingIdx);
  if (sc) {
    // Direct shortcut from a normal step: traverse + chain-jump once at exit.
    curRingIdx = sc.exitRingIdx;
    curProgress = progressFromRingIdx(curRingIdx);
    shortcutUsed = true;
    // Then jump from exit if eligible & not blocked.
    // Guard: only chain a jump when the target lies strictly forward on this
    // color's path and still within the ring portion. Otherwise the ring walk
    // would wrap around and pull the plane backward (e.g. exit at progress 36
    // has no further same-color jump cell before landing — the wrap-around
    // target would land near takeoff, which is BEHIND the plane).
    const targetRingIdx = board.nextSameColorRingIdx(color, curRingIdx);
    const targetProgress = progressFromRingIdx(targetRingIdx);
    const targetCellId = board.ring[targetRingIdx]!;
    if (
      targetProgress > curProgress &&
      targetProgress < LANDING_START_STEP &&
      !isCellOccupied(targetCellId)
    ) {
      curRingIdx = targetRingIdx;
      curProgress = targetProgress;
      jumped = true;
    }
    return {
      finalProgress: curProgress,
      finalCellId: cellIdAtProgress(board, color, curProgress),
      jumped, shortcutUsed,
    };
  }

  // Normal jump on a same-color cell.
  if (board.isJumpForColor(color, curRingIdx)) {
    // takeoff is the player's own takeoff — also same color, but we DO allow jumping from it
    // per most house rules; spec is silent. We choose: do not jump from takeoff cell (progress=0)
    // because the plane just took off there.
    if (curProgress !== 0) {
      const targetRingIdx = board.nextSameColorRingIdx(color, curRingIdx);
      const targetProgress = progressFromRingIdx(targetRingIdx);
      const targetCellId = board.ring[targetRingIdx]!;
      const targetCell = board.cells[targetCellId]!;
      // Same forward-only guard as above (prevents wrap-around backward jumps,
      // e.g. directly landing on a shortcutExit at progress 36 with no
      // further same-color jump cell before landing).
      if (
        targetProgress > curProgress &&
        targetProgress < LANDING_START_STEP &&
        !isCellOccupied(targetCellId)
      ) {
        curRingIdx = targetRingIdx;
        curProgress = targetProgress;
        jumped = true;
        // If we landed on a same-color shortcut entry via a jump, traverse only — no extra jump.
        if (targetCell.kind === 'shortcutEntry') {
          const sc2 = board.shortcutForColor(color, curRingIdx);
          if (sc2) {
            curRingIdx = sc2.exitRingIdx;
            curProgress = progressFromRingIdx(curRingIdx);
            shortcutUsed = true;
          }
        }
      }
    }
  }

  return {
    finalProgress: curProgress,
    finalCellId: cellIdAtProgress(board, color, curProgress),
    jumped, shortcutUsed,
  };
}

/** Find all foreign planes currently on `cellId` (i.e. stacked enemies). */
export function planesOnCell(
  planes: Record<Color, Plane[]>,
  cellId: number,
): { color: Color; index: number }[] {
  const out: { color: Color; index: number }[] = [];
  for (const c of Object.keys(planes) as Color[]) {
    for (const p of planes[c]) {
      if (p.state === 'onBoard' && p.cellId === cellId) out.push({ color: c, index: p.index });
    }
  }
  return out;
}

/** True iff `cellId` hosts a foreign stack (>=2 planes of the same non-`color`). */
export function hasForeignStackOnCell(
  planes: Record<Color, Plane[]>,
  color: Color,
  cellId: number,
): { stackColor: Color } | null {
  for (const c of Object.keys(planes) as Color[]) {
    if (c === color) continue;
    let n = 0;
    for (const p of planes[c]) {
      if (p.state === 'onBoard' && p.cellId === cellId) n++;
    }
    if (n >= 2) return { stackColor: c };
  }
  return null;
}

/**
 * Per rulebook §5, scan A's forward path for the first foreign stack the move
 * would *overshoot*. Returns the distance `k` (1..steps-1) and the stack's
 * color, or null when no foreign stack lies strictly between current position
 * and the natural endpoint. The natural-endpoint cell itself is excluded —
 * landing exactly on a stack is a regular collision (§5 last sentence) and is
 * handled by the caller.
 *
 * Own stacks are skipped ("自己迭机不影响自己继续行进"). The scan stops at the
 * landing strip since foreign planes cannot be there.
 */
export function findOvershootForeignStack(
  board: BuiltBoard,
  planes: Record<Color, Plane[]>,
  color: Color,
  fromProgress: number,
  steps: number,
): { distance: number; stackColor: Color } | null {
  for (let k = 1; k < steps; k++) {
    const p = fromProgress + k;
    if (p >= LANDING_START_STEP) break;
    if (p > PATH_LEN_TO_HOME) break;
    const cellId = cellIdAtProgress(board, color, p);
    const hit = hasForeignStackOnCell(planes, color, cellId);
    if (hit) return { distance: k, stackColor: hit.stackColor };
  }
  return null;
}
