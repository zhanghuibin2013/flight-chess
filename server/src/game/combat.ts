// Combat resolution — small pure helpers used by the engine.
// The engine drives the actual prompt/response loop; this module returns
// pure outcomes given inputs.

import { randomInt } from 'node:crypto';

export function rollD6(): number {
  return randomInt(1, 7);
}

export type AamRound = 'attackerWins' | 'defenderWins' | 'tie';

/** A single AAM duel round: both roll d6. */
export function aamDuel(): { attacker: number; defender: number; outcome: AamRound } {
  const a = rollD6();
  const d = rollD6();
  if (a > d) return { attacker: a, defender: d, outcome: 'attackerWins' };
  if (d > a) return { attacker: a, defender: d, outcome: 'defenderWins' };
  return { attacker: a, defender: d, outcome: 'tie' };
}

/** ARM attack rolls; success on 5/6. */
export function armRoll(): { roll: number; success: boolean } {
  const r = rollD6();
  return { roll: r, success: r >= 5 };
}

/** Cruise vs landing-strip target; success on 4/5/6. */
export function cruiseLandingRoll(): { roll: number; success: boolean } {
  const r = rollD6();
  return { roll: r, success: r >= 4 };
}
