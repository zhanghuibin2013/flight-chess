// Server-side AI policy for bot / autopilot seats.
//
// Pure functions that read the public game snapshot + (sanitized) pending
// combat info and return the action a bot should take. No engine mutation
// happens here — the bot driver applies the decision via the same engine
// API the network handler uses.

import type { Color, GameState, BoardSnapshot } from '@fkzz/shared';
import { COLORS } from '@fkzz/shared';
import { radarZoneSize } from './board.js';
import type { PendingCombatSnapshot } from './engine.js';

const PATH_LEN_TO_HOME = 73;
const LANDING_START_STEP = 68;

function cellIdAt(board: BoardSnapshot, color: Color, progress: number): number {
  const path = board.paths[color];
  if (progress >= PATH_LEN_TO_HOME) return path.home;
  if (progress >= LANDING_START_STEP) return path.landing[progress - LANDING_START_STEP]!;
  return path.ring[progress]!;
}

/** True if the destination cell sits inside any opponent's active radar
 *  zone AND that opponent currently holds at least one SAM card. */
function inOpponentSamZone(
  board: BoardSnapshot, state: GameState, color: Color, destCellId: number,
): boolean {
  for (const opp of COLORS) {
    if (opp === color) continue;
    const hand = state.hands[opp];
    if (!hand) continue;
    if (!hand.missiles.some(m => m.kind === 'sam')) continue;
    const zone = board.paths[opp].radarZone.slice(0, radarZoneSize(hand.radars));
    if (zone.includes(destCellId)) return true;
  }
  return false;
}

/**
 * Pick the best plane to move among the prompt's candidates. Mirrors the
 * client recommendPlaneIdx priority list, with an extra safety penalty
 * for landing inside an opponent's loaded radar zone.
 */
export function pickMovePlane(
  state: GameState, board: BoardSnapshot,
  color: Color, candidates: number[], roll: number,
): number {
  if (candidates.length === 0) return 0;
  if (candidates.length === 1) return candidates[0]!;

  type Score = { idx: number; tier: number; progress: number };
  const scored: Score[] = candidates.map(idx => {
    const plane = state.planes[color][idx]!;
    const isHangar = plane.state === 'hangar';
    const fromProgress = plane.progress ?? 0;
    let tier = 99;

    if (isHangar) {
      // Hangar plane: only travels to its takeoff cell — treat as priority 6.
      tier = 6;
    } else {
      let target = fromProgress + roll;
      let bounced = false;
      if (target > PATH_LEN_TO_HOME) {
        target = PATH_LEN_TO_HOME - (target - PATH_LEN_TO_HOME);
        bounced = true;
      }
      const reachesHome = !bounced && target >= PATH_LEN_TO_HOME;
      const destId = cellIdAt(board, color, target);
      const cell = board.cells.find(c => c.id === destId);
      const isShortcut = cell?.kind === 'shortcutEntry' && cell?.color === color;
      const isMissile = cell?.kind === 'missileFactory';
      const isRadar = cell?.kind === 'radarFactory';
      const qaAvailable = state.deckCounts.questions > 0;
      const isLibrary = cell?.kind === 'library' && qaAvailable;

      if (reachesHome) tier = 1;
      else if (isShortcut) tier = 2;
      else if (isMissile) tier = 3;
      else if (isRadar) tier = 4;
      else if (isLibrary) tier = 5;
      else tier = 7;

      // Safety: downgrade by one tier if destination would expose us to a
      // SAM-armed radar zone (only meaningful while still on the ring).
      if (
        target < LANDING_START_STEP &&
        inOpponentSamZone(board, state, color, destId)
      ) {
        tier = Math.min(tier + 1, 99);
      }
    }

    return { idx, tier, progress: fromProgress };
  });

  scored.sort((a, b) => a.tier - b.tier || b.progress - a.progress || a.idx - b.idx);
  return scored[0]!.idx;
}

/** Pick a hangar plane during a takeoff prompt — lowest index first. */
export function pickTakeoff(_state: GameState, _color: Color, candidates: number[]): number {
  if (candidates.length === 0) return 0;
  return Math.min(...candidates);
}

/**
 * Decide a combat response for a bot seat. The seat passed in is the seat
 * the prompt is addressed to (attacker or defender depending on stage).
 */
export function decideCombat(
  state: GameState,
  pc: PendingCombatSnapshot,
  seat: Color,
  options: string[],
): { choice: string; data?: Record<string, unknown> } {
  // "roll" prompts are unconditional — there's nothing to decide.
  if (options.length === 1 && options[0] === 'roll') return { choice: 'roll' };

  if (pc.kind === 'sam' && options.includes('fire')) {
    // Fire SAM unless the attacker plane is already in / very close to its
    // own landing strip (where SAM is wasted or ineffective).
    const target = state.planes[pc.attacker][pc.planeIndex];
    const progress = target?.progress ?? 0;
    return { choice: progress < LANDING_START_STEP ? 'fire' : 'skip' };
  }

  if (pc.kind === 'aam' && options.includes('fire')) {
    // Fire decision (collision OR proactive).
    const attHand = state.hands[pc.attacker];
    const aamReserve = attHand.missiles.filter(m => m.kind === 'aam').length;
    const myPlane = state.planes[pc.attacker][pc.attackerPlaneIndex];
    const defPlane = state.planes[pc.defender][pc.defenderPlaneIndices[0]!];
    const myProgress = myPlane?.progress ?? 0;
    const defProgress = defPlane?.progress ?? 0;
    // Fire if we have spare AAM (reserve >= 2) or the trade is offensively
    // worthwhile (the enemy is further along than we are).
    if (aamReserve >= 2 || defProgress > myProgress) return { choice: 'fire' };
    return { choice: 'skip' };
  }

  if (pc.kind === 'aam' && options.includes('counter')) {
    // We already won the primary defense — counter whenever we still hold AAM.
    const defHand = state.hands[pc.defender];
    const reserve = defHand.missiles.filter(m => m.kind === 'aam').length;
    return { choice: reserve >= 1 ? 'counter' : 'skip' };
  }

  // Fallback: pick the first option.
  return { choice: options[0] ?? 'skip' };
}

/**
 * Pick a QA answer. Bots don't know the correct answer, so we deterministically
 * pick the first option — keeps replay debuggable. */
export function pickQAAnswer(_questionId: string, options: string[]): number {
  if (!options.length) return 0;
  return 0;
}
