// Bot driver — listens to engine state changes, schedules auto-actions for
// any seat that is a bot or has autopilot enabled. The driver mirrors the
// network layer: it calls the same engine entry points a human would.

import type { Color, GameState } from '@fkzz/shared';
import type { GameEngine } from './engine.js';
import * as bot from './bot.js';

const BOT_THINK_MS = 600;

export class BotDriver {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private engine: GameEngine,
    /** Resolves whether a seat is currently controlled by AI (bot or autopilot). */
    private isSeatBot: (color: Color) => boolean,
  ) {}

  /** Re-evaluate after every engine state commit. Called from the engine
   *  callback wired up by the network layer. */
  tick(state: GameState): void {
    if (this.stopped) return;
    if (state.phase === 'gameOver') {
      this.cancel();
      return;
    }

    // Identify the seat that owes the next action.
    let actorSeat: Color | null = null;
    if (state.prompts.length > 0) {
      actorSeat = state.prompts[0]!.seat;
    } else if (state.phase === 'awaitRoll') {
      actorSeat = state.turn;
    }

    if (!actorSeat) {
      this.cancel();
      return;
    }
    if (!this.isSeatBot(actorSeat)) {
      this.cancel();
      return;
    }

    // Debounce: a fresh state commit replaces any pending action.
    this.cancel();
    const seat = actorSeat;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.stopped) return;
      // Re-check the engine state at fire time — it may have advanced
      // due to a concurrent human input.
      try {
        this.act(seat);
      } catch (e) {
        // Swallow errors so a buggy bot decision can't crash the room.
        // eslint-disable-next-line no-console
        console.error('[BotDriver] act failed', e);
      }
    }, BOT_THINK_MS);
  }

  /** Tear down — call on engine teardown / room disband. */
  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private act(seat: Color): void {
    const state = this.engine.state;
    if (state.phase === 'gameOver') return;

    // Re-validate that this seat still owes an action.
    const prompt = state.prompts.find(p => p.seat === seat);
    if (!prompt) {
      if (state.phase === 'awaitRoll' && state.turn === seat) {
        this.engine.rollDice(seat);
      }
      return;
    }
    if (!this.isSeatBot(seat)) return;

    if (prompt.kind === 'takeoff') {
      const idx = bot.pickTakeoff(state, seat, prompt.planes);
      this.engine.chooseTakeoff(seat, idx);
      return;
    }
    if (prompt.kind === 'move') {
      const board = this.engine.boardSnapshot();
      const idx = bot.pickMovePlane(state, board, seat, prompt.planes, prompt.roll);
      this.engine.chooseMovePlane(seat, idx);
      return;
    }
    if (prompt.kind === 'combat') {
      const pc = this.engine.getPendingCombat();
      if (!pc) return;
      const decision = bot.decideCombat(state, pc, seat, prompt.options);
      this.engine.combatRespond(seat, prompt.combatId, decision.choice, decision.data);
      return;
    }
    if (prompt.kind === 'qa') {
      const ans = bot.pickQAAnswer(prompt.questionId, prompt.options);
      this.engine.qaAnswer(seat, prompt.questionId, ans);
      return;
    }
    // 'card' prompt — bots don't proactively play held cards in v1.
  }
}
