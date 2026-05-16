// Card decks: build & shuffle per spec counts.

import { nanoid } from 'nanoid';
import type {
  AnyCard, MissileCard, RadarCard, RewardCard, PunishmentCard,
  RewardKind, PunishmentKind, MissileKind, QuestionRow,
} from '@fkzz/shared';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class Deck<T extends AnyCard | QuestionRow> {
  private draw_: T[];
  private discard_: T[] = [];
  constructor(initial: T[]) {
    this.draw_ = shuffle(initial);
  }
  get size() { return this.draw_.length; }
  get totalSize() { return this.draw_.length + this.discard_.length; }
  isEmpty() { return this.draw_.length === 0 && this.discard_.length === 0; }
  draw(): T | null {
    if (this.draw_.length === 0) {
      if (this.discard_.length === 0) return null;
      this.draw_ = shuffle(this.discard_);
      this.discard_ = [];
    }
    return this.draw_.pop() ?? null;
  }
  discard(c: T) { this.discard_.push(c); }
  discardMany(cs: T[]) { for (const c of cs) this.discard_.push(c); }
}

const REWARD_COUNTS: Record<RewardKind, number> = {
  rerollFwd: 4, fwd2: 4, fwd4: 4, fwd6: 4,
  gainMissile: 4, gainRadar: 4, enemySkip: 4, shield: 2,
};
const PUNISH_COUNTS: Record<PunishmentKind, number> = {
  rerollBwd: 4, bwd2: 4, bwd4: 4, bwd6: 4,
  toTakeoff: 2, selfSkip: 4, loseMissile: 4, loseRadar: 4,
};
const MISSILE_COUNTS: Record<MissileKind, number> = {
  aam: 20, sam: 20, arm: 4, cruise: 4,
};
const RADAR_COUNT = 28;

export function buildMissileFactoryDeck(): Deck<MissileCard> {
  const cards: MissileCard[] = [];
  for (const [kind, n] of Object.entries(MISSILE_COUNTS) as [MissileKind, number][]) {
    for (let i = 0; i < n; i++) {
      cards.push({ id: nanoid(8), type: 'missile', kind });
    }
  }
  return new Deck<MissileCard>(cards);
}

export function buildRadarDeck(): Deck<RadarCard> {
  return new Deck<RadarCard>(Array.from({ length: RADAR_COUNT }, () => ({
    id: nanoid(8), type: 'radar',
  })));
}

export function buildRewardDeck(): Deck<RewardCard> {
  const cards: RewardCard[] = [];
  for (const [kind, n] of Object.entries(REWARD_COUNTS) as [RewardKind, number][]) {
    for (let i = 0; i < n; i++) {
      cards.push({ id: nanoid(8), type: 'reward', kind });
    }
  }
  return new Deck<RewardCard>(cards);
}

export function buildPunishmentDeck(): Deck<PunishmentCard> {
  const cards: PunishmentCard[] = [];
  for (const [kind, n] of Object.entries(PUNISH_COUNTS) as [PunishmentKind, number][]) {
    for (let i = 0; i < n; i++) {
      cards.push({ id: nanoid(8), type: 'punishment', kind });
    }
  }
  return new Deck<PunishmentCard>(cards);
}

export function buildQuestionDeck(rows: QuestionRow[]): Deck<QuestionRow> {
  return new Deck<QuestionRow>(rows.slice());
}

/** Reward sub-types (1)-(4) are "trigger only & return after use".
 *  (5)-(8) are kept in hand until used. */
export function isHeldReward(k: RewardKind): boolean {
  return k === 'gainMissile' || k === 'gainRadar' || k === 'enemySkip' || k === 'shield';
}
/** Punishment (7),(8) are kept in hand until consumed; rest are immediate. */
export function isHeldPunishment(k: PunishmentKind): boolean {
  return k === 'loseMissile' || k === 'loseRadar';
}
