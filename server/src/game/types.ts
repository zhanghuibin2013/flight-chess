// Internal engine types (server-only).

import type { Color, GameState, Plane, PlayerHand } from '@fkzz/shared';

/** Outstanding combat the engine is waiting for a response on. */
export interface PendingCombat {
  id: string;
  kind: 'sam' | 'aam' | 'aamCounter' | 'arm' | 'cruise';
  attacker: Color;
  defender: Color;
  /** Optional context filled by the kind. */
  context: Record<string, unknown>;
}

export interface PendingQA {
  questionId: string;
  seat: Color;
  /** Seconds when the QA was posed. */
  ts: number;
}

export interface EngineLog {
  push(line: string): void;
}

export type EnginePromptCallback = (state: GameState) => void;
