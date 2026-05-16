// Authoritative game engine for 防控作战飞行棋.
//
// This is a turn-based state machine: each public method maps to a player
// intent (or a host action). After every transition, `onState` is called
// with a snapshot the network layer broadcasts.
//
// Notation:
//  - `seat` / color: red|yellow|blue|green
//  - "current" player: state.turn
//
// We keep the engine pragmatic: complex multi-step interactions (AAM duels,
// stacked-defender counters, optional reward plays) are modelled as a
// single "pending prompt" at a time. The client either chooses an option
// or the turn timer auto-resolves with safe defaults.

import { nanoid } from 'nanoid';
import { randomInt } from 'node:crypto';
import type {
  AnyCard, BoardSnapshot, CardId, Color, GameOptions, GameState, MissileCard,
  MissileKind, Plane, PlayerHand, Prompt, PunishmentCard, PunishmentKind,
  QuestionRow, RewardCard, RewardKind,
} from '@fkzz/shared';
import { COLORS } from '@fkzz/shared';

import { buildBoard, BuiltBoard, radarZoneSize } from './board.js';
import {
  buildMissileFactoryDeck, buildPunishmentDeck, buildQuestionDeck, buildRadarDeck,
  buildRewardDeck, Deck, isHeldPunishment, isHeldReward,
} from './decks.js';
import {
  aamDuel, armRoll, cruiseLandingRoll, rollD6,
} from './combat.js';
import {
  cellIdAtProgress, isAtHome, isInLandingStrip, isOnTakeoff,
  LANDING_START_STEP, PATH_LEN_TO_HOME, planesOnCell, resolveJumpChain, stepBackward, stepForward,
} from './rules.js';

const MAX_LOG = 200;

interface DrawnCardEvent {
  seat: Color;
  card: AnyCard;
}

interface PendingCombatBase {
  id: string;
  attacker: Color;
  defender: Color;
}
type PendingCombat =
  | (PendingCombatBase & { kind: 'sam'; planeIndex: number; passedCellIds: number[] })
  | (PendingCombatBase & { kind: 'aam'; attackerPlaneIndex: number; defenderPlaneIndices: number[]; collisionCellId: number })
  | (PendingCombatBase & { kind: 'aamCounter'; attackerPlaneIndex: number; defenderPlaneIndex: number; collisionCellId: number; remainingCounters: number })
  | (PendingCombatBase & { kind: 'arm'; targetRadarSpent: boolean })
  | (PendingCombatBase & { kind: 'cruise'; targetPlaneIndex: number; targetCellId: number; landingShot: boolean });

interface PendingQA {
  questionId: string;
  question: QuestionRow;
  seat: Color;
}

export interface EngineCallbacks {
  /** Called after every committed state change. */
  onState(state: GameState): void;
  /** Called on per-event broadcasts (dice, card draws, log). */
  onEvent(ev:
    | { kind: 'dice'; seat: Color; value: number; chain: number }
    | { kind: 'cardDrawn'; seat: Color; card: AnyCard }
    | { kind: 'log'; line: string }
  ): void;
  /** Called when game ends. */
  onGameOver(winners: Color[]): void;
}

export class GameEngine {
  readonly board: BuiltBoard;
  readonly questions: Deck<QuestionRow>;
  readonly missileDeck: Deck<MissileCard>;
  readonly radarDeck: Deck<{ id: string; type: 'radar' }>;
  readonly rewardDeck: Deck<RewardCard>;
  readonly punishmentDeck: Deck<PunishmentCard>;

  state: GameState;
  private pendingCombat: PendingCombat | null = null;
  private pendingQA: PendingQA | null = null;
  /** Players actively playing this game, in turn order. */
  private playerSeats: Color[];
  /** Pending bonus rolls / steps queued for the current player (e.g. reward (1) reroll). */
  private pendingExtraRoll = false;
  private pendingForwardSteps = 0;
  private pendingBackwardSteps = 0;
  /** A free-form flag enabling "this turn's chosen plane gets +N steps" before move. */
  private appliedTriggerCard: RewardCard | PunishmentCard | null = null;
  /** Whether the current move ended in a collision (suppresses factory/library triggers). */
  private currentMoveEndedInCollision = false;
  /** Radars per color (indexed by hand state but mirrored here for SAM detection). */

  constructor(
    options: GameOptions,
    seats: Color[],
    questions: QuestionRow[],
    private cb: EngineCallbacks,
  ) {
    this.board = buildBoard();
    this.questions = buildQuestionDeck(questions);
    this.missileDeck = buildMissileFactoryDeck();
    this.radarDeck = buildRadarDeck() as unknown as Deck<{ id: string; type: 'radar' }>;
    this.rewardDeck = buildRewardDeck();
    this.punishmentDeck = buildPunishmentDeck();
    this.playerSeats = seats.slice();

    this.state = this.initialState(options);
  }

  // ---------- Public board snapshot for clients ----------
  boardSnapshot(): BoardSnapshot {
    return { cells: this.board.cells, paths: this.board.paths };
  }

  // ---------- State init ----------
  private initialState(options: GameOptions): GameState {
    const planes = {} as Record<Color, Plane[]>;
    const hands = {} as Record<Color, PlayerHand>;
    for (const c of COLORS) {
      planes[c] = Array.from({ length: 4 }, (_, i) => ({
        index: i, color: c, state: 'hangar' as const,
      }));
      hands[c] = {
        missiles: [], radars: 0,
        heldRewards: [], heldPunishments: [],
        shield: false, skipRounds: 0,
      };
    }
    return {
      phase: 'awaitRoll',
      turn: this.playerSeats[0]!,
      diceChain: 0,
      planes,
      hands,
      deckCounts: this.deckCounts(),
      prompts: [],
      log: [],
      winners: [],
      startedAt: Date.now(),
      options,
    };
  }

  private deckCounts() {
    return {
      aam: this.countMissileDeckByKind('aam'),
      sam: this.countMissileDeckByKind('sam'),
      arm: this.countMissileDeckByKind('arm'),
      cruise: this.countMissileDeckByKind('cruise'),
      radar: this.radarDeck.totalSize,
      reward: this.rewardDeck.totalSize,
      punishment: this.punishmentDeck.totalSize,
      questions: this.questions.totalSize,
    };
  }

  /** Cheap proxy: missile factory deck is one big mixed deck, so we report
   *  total size for each kind as a soft estimate (not strictly per-kind). */
  private countMissileDeckByKind(_kind: MissileKind): number {
    return this.missileDeck.totalSize; // acceptable approximation in v1
  }

  // ---------- Logging & commit ----------
  private log(line: string) {
    this.state.log.push(line);
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
    this.cb.onEvent({ kind: 'log', line });
  }
  private commit() {
    this.state.deckCounts = this.deckCounts();
    this.cb.onState(structuredClone(this.state));
  }

  // ---------- Turn lifecycle ----------
  private advanceTurn() {
    if (this.checkVictory()) return;
    let i = this.playerSeats.indexOf(this.state.turn);
    for (let step = 0; step < this.playerSeats.length; step++) {
      i = (i + 1) % this.playerSeats.length;
      const next = this.playerSeats[i]!;
      const hand = this.state.hands[next];
      if (hand.skipRounds > 0) {
        hand.skipRounds -= 1;
        this.log(`${next} skipped a round`);
        continue;
      }
      this.state.turn = next;
      this.state.phase = 'awaitRoll';
      this.state.diceChain = 0;
      this.state.lastDice = undefined;
      this.state.prompts = [];
      this.commit();
      return;
    }
    // Should not happen: all skipped.
    this.state.phase = 'awaitRoll';
    this.commit();
  }

  // ---------- Public API: rolling ----------
  rollDice(seat: Color) {
    if (this.state.phase !== 'awaitRoll' || this.state.turn !== seat) return this.err('not your roll');
    const roll = rollD6();
    this.state.lastDice = roll;
    if (roll === 6) this.state.diceChain += 1;
    this.cb.onEvent({ kind: 'dice', seat, value: roll, chain: this.state.diceChain });
    this.log(`${seat} rolled ${roll}`);

    // 3 sixes in a row => bust (configurable house rule); cancels move and ends turn.
    if (this.state.diceChain >= 3) {
      this.log(`${seat} rolled three 6's — turn cancelled`);
      this.advanceTurn();
      return;
    }

    // Decide next phase: takeoff option or movement option.
    const canTakeoff = this.state.options.takeoffNumbers.includes(roll)
      && this.state.planes[seat].some(p => p.state === 'hangar');
    const movableIndices = this.movablePlaneIndices(seat, roll);

    if (canTakeoff && movableIndices.length === 0) {
      this.state.phase = 'awaitTakeoffChoice';
      this.state.prompts = [{ kind: 'takeoff', seat, planes: this.hangarPlaneIndices(seat) }];
    } else if (canTakeoff) {
      // Player may choose to take off OR move an existing plane: surface as a takeoff prompt
      // (client can still skip and move via 'move' prompt next). For simplicity, present
      // takeoff choice as primary when available; clients can choose any plane (hangar or onBoard)
      // if takeoff number == regular roll. We surface a unified "move" prompt that includes
      // hangar planes when takeoff is allowed.
      const hangarIdx = this.hangarPlaneIndices(seat);
      this.state.phase = 'awaitMoveChoice';
      this.state.prompts = [{ kind: 'move', seat, planes: [...hangarIdx, ...movableIndices], roll }];
    } else if (movableIndices.length > 0) {
      this.state.phase = 'awaitMoveChoice';
      this.state.prompts = [{ kind: 'move', seat, planes: movableIndices, roll }];
    } else {
      // No legal move at all: extra roll if 6, else end turn.
      this.log(`${seat} has no legal move`);
      if (roll === 6) {
        this.state.phase = 'awaitRoll';
        this.state.prompts = [];
        this.commit();
        return;
      }
      this.advanceTurn();
      return;
    }
    this.commit();
  }

  // ---------- Takeoff ----------
  chooseTakeoff(seat: Color, planeIndex: number) {
    if (this.state.turn !== seat) return this.err('not your turn');
    if (this.state.phase !== 'awaitTakeoffChoice' && this.state.phase !== 'awaitMoveChoice') return this.err('cannot take off now');
    const plane = this.state.planes[seat][planeIndex];
    if (!plane || plane.state !== 'hangar') return this.err('not a hangar plane');
    const takeoffCell = this.board.paths[seat].takeoff;
    plane.state = 'onBoard';
    plane.cellId = takeoffCell;
    plane.progress = 0;
    plane.perched = false;
    this.log(`${seat}'s plane #${planeIndex + 1} took off`);
    // Takeoff cell may be occupied by enemy; takeoff itself does not collide with enemies
    // (per most rule sets the takeoff is a safe entry). We treat it as safe.
    this.afterTurnAction(seat);
  }

  // ---------- Move ----------
  chooseMovePlane(seat: Color, planeIndex: number) {
    if (this.state.turn !== seat) return this.err('not your turn');
    if (this.state.phase !== 'awaitMoveChoice') return this.err('not in move phase');
    const roll = this.state.lastDice!;
    const plane = this.state.planes[seat][planeIndex];
    if (!plane) return this.err('no such plane');

    if (plane.state === 'hangar') {
      if (!this.state.options.takeoffNumbers.includes(roll)) return this.err('cannot take off on this roll');
      this.chooseTakeoff(seat, planeIndex);
      return;
    }
    if (plane.state !== 'onBoard') return this.err('plane is not movable');
    if (plane.progress === undefined) plane.progress = 0;

    // Apply forward step + bounce.
    const step = stepForward(this.board, seat, plane.progress, roll);
    plane.progress = step.progress;
    plane.cellId = step.cellId;
    if (step.bounced) this.log(`${seat} bounced back from home overshoot`);

    this.resolveLandingAndContinue(seat, planeIndex);
  }

  private resolveLandingAndContinue(seat: Color, planeIndex: number) {
    const plane = this.state.planes[seat][planeIndex]!;
    this.currentMoveEndedInCollision = false;

    // Apply jump / shortcut chain (ring-only).
    if (plane.cellId !== undefined && plane.progress !== undefined && plane.progress < LANDING_START_STEP) {
      const jr = resolveJumpChain(
        this.board, seat, plane.progress,
        (cellId) => planesOnCell(this.state.planes, cellId).length > 0,
      );
      if (jr.finalProgress !== plane.progress) {
        plane.progress = jr.finalProgress;
        plane.cellId = jr.finalCellId;
        if (jr.shortcutUsed) this.log(`${seat} took a shortcut`);
        if (jr.jumped) this.log(`${seat} jumped on a same-color cell`);
      }
    }

    if (plane.cellId === undefined) return;

    // Stack / collision detection (skipped if plane went home).
    if (isAtHome(plane.progress!)) {
      plane.state = 'home';
      plane.cellId = this.board.paths[seat].home;
      this.log(`${seat}'s plane #${planeIndex + 1} reached home`);
    } else {
      this.handleStackAndCollision(seat, planeIndex);
    }

    if (this.checkVictory()) return;

    // Special-cell trigger (suppressed if collision happened this move).
    if (!this.currentMoveEndedInCollision && plane.state === 'onBoard') {
      this.handleSpecialCell(seat, planeIndex);
      // After special cell, possibly QA pending — that holds phase.
      if (this.state.phase === 'awaitQA') { this.commit(); return; }
    }

    // Trigger SAM if plane passed through enemy radar zone (after all jumps).
    this.maybeTriggerSamForMove(seat, planeIndex);
    if (this.state.phase === 'awaitCombat') { this.commit(); return; }

    // End-of-action: extra roll if dice was 6 AND no other prompt is pending.
    this.afterTurnAction(seat);
  }

  private handleStackAndCollision(seat: Color, planeIndex: number) {
    const plane = this.state.planes[seat][planeIndex]!;
    const cellId = plane.cellId!;
    const others = planesOnCell(this.state.planes, cellId)
      .filter(p => !(p.color === seat && p.index === planeIndex));
    if (others.length === 0) return;

    // Self-stack: ignore (own planes don't collide with each other).
    const enemies = others.filter(o => o.color !== seat);
    if (enemies.length === 0) return;

    const roll = this.state.lastDice!;
    // Special perch rule: A approaches B's stack from a 6-roll.
    const enemyByColor: Record<string, number[]> = {};
    for (const e of enemies) (enemyByColor[e.color] ||= []).push(e.index);
    const stackedEnemyColor = Object.keys(enemyByColor).find(c => (enemyByColor[c]!).length >= 2);

    if (roll === 6 && stackedEnemyColor) {
      // Perch on top, advance next turn.
      plane.perched = true;
      this.log(`${seat} perched on top of ${stackedEnemyColor}'s stack`);
      return;
    }

    // Otherwise: collision. The attacker offers AAM declaration if they have one.
    // For each *single* enemy on cell, attacker collides with all of them; a stack
    // forces "attacker + 1 of stack returns" rule.
    if (stackedEnemyColor) {
      // Attacker + one stack member return.
      const targetIdx = enemyByColor[stackedEnemyColor]![0]!;
      // Offer AAM if attacker has one.
      if (this.state.hands[seat].missiles.some(m => m.kind === 'aam')) {
        this.openAamPrompt(seat, planeIndex, stackedEnemyColor as Color, [targetIdx], cellId);
      } else {
        this.applyCollision(seat, planeIndex, [{ color: stackedEnemyColor as Color, index: targetIdx }]);
      }
    } else {
      // Single enemy(ies): collision with all of them; if attacker has AAM, offer for the first one.
      const targets = enemies.map(e => ({ color: e.color, index: e.index }));
      if (this.state.hands[seat].missiles.some(m => m.kind === 'aam')) {
        const t = targets[0]!;
        this.openAamPrompt(seat, planeIndex, t.color, [t.index], cellId);
      } else {
        this.applyCollision(seat, planeIndex, targets);
      }
    }
  }

  private applyCollision(
    attacker: Color, attackerIdx: number,
    defenders: { color: Color; index: number }[],
  ) {
    this.currentMoveEndedInCollision = true;
    const ap = this.state.planes[attacker][attackerIdx]!;
    this.returnToHangar(ap);
    for (const d of defenders) {
      const dp = this.state.planes[d.color][d.index]!;
      this.returnToHangar(dp);
    }
    const list = defenders.map(d => `${d.color}#${d.index + 1}`).join(', ');
    this.log(`Collision: ${attacker}#${attackerIdx + 1} vs ${list} — all return to hangar`);
  }

  private returnToHangar(p: Plane) {
    p.state = 'hangar';
    p.cellId = undefined;
    p.progress = undefined;
    p.perched = false;
  }

  // ---------- AAM duel ----------
  private openAamPrompt(
    attacker: Color, attackerIdx: number,
    defender: Color, defenderIdxs: number[], cellId: number,
  ) {
    const id = nanoid(6);
    this.pendingCombat = {
      id, kind: 'aam', attacker, defender,
      attackerPlaneIndex: attackerIdx,
      defenderPlaneIndices: defenderIdxs,
      collisionCellId: cellId,
    };
    this.state.phase = 'awaitCombat';
    this.state.prompts = [{
      kind: 'combat', seat: attacker, combatId: id,
      description: `Collision with ${defender}. Launch AAM?`,
      options: ['fire', 'skip'],
    }];
  }

  combatRespond(seat: Color, combatId: string, choice: string, data?: Record<string, unknown>) {
    if (!this.pendingCombat || this.pendingCombat.id !== combatId) return this.err('no such combat');
    const pc = this.pendingCombat;

    if (pc.kind === 'aam') {
      if (seat !== pc.attacker) return this.err('not your decision');
      const attacker = pc.attacker, defender = pc.defender;
      const defIdx = pc.defenderPlaneIndices[0]!;
      const cellId = pc.collisionCellId;
      if (choice === 'skip') {
        // Plain collision.
        this.pendingCombat = null;
        this.applyCollision(attacker, pc.attackerPlaneIndex, [{ color: defender, index: defIdx }]);
        this.afterCombatResolved();
        return;
      }
      if (choice === 'fire') {
        // Spend AAM
        if (!this.spendMissile(attacker, 'aam')) return this.err('no aam');
        const res = aamDuel();
        this.log(`AAM duel: attacker ${res.attacker} vs defender ${res.defender}`);
        if (res.outcome === 'attackerWins') {
          // Defender returns; attacker stays.
          this.returnToHangar(this.state.planes[defender][defIdx]!);
          this.log(`${defender}#${defIdx + 1} returns to hangar`);
          this.pendingCombat = null;
          this.afterCombatResolved();
          return;
        }
        if (res.outcome === 'defenderWins') {
          // Defender holds AAM? Counter-attack.
          if (this.state.hands[defender].missiles.some(m => m.kind === 'aam')) {
            // Convert to counter prompt.
            this.spendMissile(defender, 'aam');
            // Defender wins counter? attacker returns; else tie/attacker still stands.
            const cr = aamDuel();
            this.log(`Counter AAM: defender ${cr.defender} vs attacker ${cr.attacker}`);
            if (cr.outcome === 'defenderWins') {
              this.returnToHangar(this.state.planes[attacker][pc.attackerPlaneIndex]!);
              this.log(`${attacker}#${pc.attackerPlaneIndex + 1} returns to hangar`);
            } else if (cr.outcome === 'attackerWins') {
              this.log('Attacker re-wins after counter — both stay, attacker continues');
            } else {
              this.log('Counter tie — both stay');
            }
            this.pendingCombat = null;
            this.afterCombatResolved();
            return;
          } else {
            // No counter possible: attacker returns.
            this.returnToHangar(this.state.planes[attacker][pc.attackerPlaneIndex]!);
            this.log(`${attacker}#${pc.attackerPlaneIndex + 1} returns to hangar`);
            this.pendingCombat = null;
            this.afterCombatResolved();
            return;
          }
        }
        // Tie: both stay; attacker continues.
        this.log('AAM tie — both stay');
        this.pendingCombat = null;
        this.afterCombatResolved();
        return;
      }
    }

    if (pc.kind === 'sam') {
      if (seat !== pc.defender) return this.err('not your SAM');
      if (choice === 'fire') {
        if (!this.spendMissile(pc.defender, 'sam')) return this.err('no sam');
        const target = this.state.planes[pc.attacker][pc.planeIndex]!;
        // Shield?
        if (this.state.hands[pc.attacker].shield) {
          this.state.hands[pc.attacker].shield = false;
          this.log(`${pc.attacker} shielded SAM hit`);
        } else {
          this.returnToHangar(target);
          this.log(`SAM hit: ${pc.attacker}#${pc.planeIndex + 1} returns to hangar`);
        }
      } else {
        this.log(`${pc.defender} held fire`);
      }
      this.pendingCombat = null;
      this.afterCombatResolved();
      return;
    }

    return this.err('unhandled combat kind');
  }

  private afterCombatResolved() {
    this.state.prompts = [];
    if (this.checkVictory()) return;
    this.afterTurnAction(this.state.turn);
  }

  // ---------- Special cells ----------
  private handleSpecialCell(seat: Color, planeIndex: number) {
    const plane = this.state.planes[seat][planeIndex]!;
    if (plane.state !== 'onBoard' || plane.cellId === undefined) return;
    const cell = this.board.cells[plane.cellId]!;
    const hand = this.state.hands[seat];

    if (cell.kind === 'missileFactory') {
      const card = this.missileDeck.draw();
      if (card) {
        hand.missiles.push(card);
        this.cb.onEvent({ kind: 'cardDrawn', seat, card });
        this.log(`${seat} drew ${card.kind.toUpperCase()} missile`);
      }
    } else if (cell.kind === 'radarFactory') {
      const card = this.radarDeck.draw();
      if (card) {
        hand.radars += 1;
        this.cb.onEvent({ kind: 'cardDrawn', seat, card: { id: card.id, type: 'radar' } });
        this.log(`${seat} got a radar (now ${hand.radars})`);
      }
    } else if (cell.kind === 'library') {
      this.openLibrary(seat);
    }
  }

  private openLibrary(seat: Color) {
    const q = this.questions.draw();
    if (!q) {
      this.log(`Library has no questions loaded — no effect`);
      return;
    }
    const id = nanoid(6);
    this.pendingQA = { questionId: id, question: q, seat };
    this.state.phase = 'awaitQA';
    this.state.prompts = [{ kind: 'qa', seat, questionId: id, prompt: q.prompt, options: q.options }];
  }

  qaAnswer(seat: Color, questionId: string, answerIndex: number) {
    if (!this.pendingQA || this.pendingQA.questionId !== questionId) return this.err('no qa');
    if (seat !== this.pendingQA.seat) return this.err('not your qa');
    const correct = answerIndex === this.pendingQA.question.answerIndex;
    this.questions.discard(this.pendingQA.question);
    this.pendingQA = null;
    if (correct) {
      this.log(`${seat} answered correctly — drawing reward`);
      this.applyDrawnReward(seat);
    } else {
      this.log(`${seat} answered wrong — drawing punishment`);
      this.applyDrawnPunishment(seat);
    }
    this.state.prompts = [];
    if (this.state.phase === 'awaitQA') this.state.phase = 'resolving';
    this.afterTurnAction(seat);
  }

  private applyDrawnReward(seat: Color) {
    const card = this.rewardDeck.draw();
    if (!card) return;
    this.cb.onEvent({ kind: 'cardDrawn', seat, card });
    this.log(`${seat} drew reward: ${card.kind}`);
    if (isHeldReward(card.kind)) {
      this.state.hands[seat].heldRewards.push(card);
      // Some held rewards take immediate action via UI; we keep them in hand by default.
      if (card.kind === 'gainMissile') {
        const m = this.missileDeck.draw();
        if (m) this.state.hands[seat].missiles.push(m);
        // consume immediately and return card to deck
        this.removeReward(seat, card.id);
        this.rewardDeck.discard(card);
      } else if (card.kind === 'gainRadar') {
        const r = this.radarDeck.draw();
        if (r) this.state.hands[seat].radars += 1;
        this.removeReward(seat, card.id);
        this.rewardDeck.discard(card);
      } else if (card.kind === 'shield') {
        this.state.hands[seat].shield = true;
        this.removeReward(seat, card.id);
        this.rewardDeck.discard(card);
      }
      // 'enemySkip' kept in hand until played.
    } else {
      // Trigger-cell only, return after use. We apply immediately here since this draw is itself the trigger.
      this.applyTriggerReward(seat, card);
      this.rewardDeck.discard(card);
    }
  }
  private removeReward(seat: Color, cardId: CardId) {
    const arr = this.state.hands[seat].heldRewards;
    const i = arr.findIndex(c => c.id === cardId);
    if (i >= 0) arr.splice(i, 1);
  }

  private applyTriggerReward(seat: Color, card: RewardCard) {
    switch (card.kind) {
      case 'rerollFwd':
        this.pendingExtraRoll = true;
        this.log(`${seat} will reroll & advance`);
        break;
      case 'fwd2': this.advanceLastMovedPlane(seat, 2); break;
      case 'fwd4': this.advanceLastMovedPlane(seat, 4); break;
      case 'fwd6': this.advanceLastMovedPlane(seat, 6); break;
      default: break;
    }
  }

  private applyDrawnPunishment(seat: Color) {
    const card = this.punishmentDeck.draw();
    if (!card) return;
    this.cb.onEvent({ kind: 'cardDrawn', seat, card });
    this.log(`${seat} drew punishment: ${card.kind}`);
    if (isHeldPunishment(card.kind)) {
      this.state.hands[seat].heldPunishments.push(card);
      // Apply (lose missile / radar) immediately.
      if (card.kind === 'loseMissile' && this.state.hands[seat].missiles.length > 0) {
        const m = this.state.hands[seat].missiles.shift()!;
        this.missileDeck.discard(m);
        this.removePunishment(seat, card.id);
      } else if (card.kind === 'loseRadar' && this.state.hands[seat].radars > 0) {
        this.state.hands[seat].radars -= 1;
        this.radarDeck.discard({ id: nanoid(6), type: 'radar' });
        this.removePunishment(seat, card.id);
      }
      this.punishmentDeck.discard(card);
    } else {
      this.applyTriggerPunishment(seat, card);
      this.punishmentDeck.discard(card);
    }
  }
  private removePunishment(seat: Color, cardId: CardId) {
    const arr = this.state.hands[seat].heldPunishments;
    const i = arr.findIndex(c => c.id === cardId);
    if (i >= 0) arr.splice(i, 1);
  }

  private applyTriggerPunishment(seat: Color, card: PunishmentCard) {
    switch (card.kind) {
      case 'rerollBwd':
        // Special: roll d6 immediately and retreat.
        const r = rollD6();
        this.cb.onEvent({ kind: 'dice', seat, value: r, chain: 0 });
        this.log(`${seat} retreats ${r}`);
        this.retreatLastMovedPlane(seat, r);
        break;
      case 'bwd2': this.retreatLastMovedPlane(seat, 2); break;
      case 'bwd4': this.retreatLastMovedPlane(seat, 4); break;
      case 'bwd6': this.retreatLastMovedPlane(seat, 6); break;
      case 'toTakeoff': this.sendLastMovedPlaneToTakeoff(seat); break;
      case 'selfSkip':
        this.state.hands[seat].skipRounds += 1;
        this.log(`${seat} will skip a round`);
        break;
      default: break;
    }
  }

  private advanceLastMovedPlane(seat: Color, n: number) {
    // Find the plane that triggered the library — equivalently, the most recently moved
    // plane on the board for `seat`. We pick the one with the smallest "distance to home".
    const plane = this.findRecentMovedPlane(seat);
    if (!plane) return;
    const step = stepForward(this.board, seat, plane.progress!, n);
    plane.progress = step.progress;
    plane.cellId = step.cellId;
    if (isAtHome(plane.progress)) plane.state = 'home';
  }
  private retreatLastMovedPlane(seat: Color, n: number) {
    const plane = this.findRecentMovedPlane(seat);
    if (!plane) return;
    const step = stepBackward(this.board, seat, plane.progress!, n);
    plane.progress = step.progress;
    plane.cellId = step.cellId;
  }
  private sendLastMovedPlaneToTakeoff(seat: Color) {
    const plane = this.findRecentMovedPlane(seat);
    if (!plane) return;
    plane.progress = 0;
    plane.cellId = this.board.paths[seat].takeoff;
  }
  private findRecentMovedPlane(seat: Color): Plane | null {
    // Heuristic: pick onBoard plane with greatest progress.
    let best: Plane | null = null;
    for (const p of this.state.planes[seat]) {
      if (p.state === 'onBoard') {
        if (!best || (p.progress ?? 0) > (best.progress ?? 0)) best = p;
      }
    }
    return best;
  }

  // ---------- Card play (held cards from hand) ----------
  playCard(
    seat: Color, cardId: CardId,
    targetColor?: Color, targetPlaneIndex?: number, targetRadarIndex?: number,
  ) {
    if (this.state.turn !== seat) return this.err('not your turn');
    const hand = this.state.hands[seat];

    // Held reward: enemySkip
    const ri = hand.heldRewards.findIndex(c => c.id === cardId);
    if (ri >= 0) {
      const card = hand.heldRewards[ri]!;
      if (card.kind === 'enemySkip' && targetColor && targetColor !== seat) {
        this.state.hands[targetColor].skipRounds += 1;
        hand.heldRewards.splice(ri, 1);
        this.rewardDeck.discard(card);
        this.log(`${seat} forces ${targetColor} to skip a round`);
        this.commit();
        return;
      }
      return this.err('cannot play this reward now');
    }

    // Held missile / arm / cruise / aam are played from missiles
    const mi = hand.missiles.findIndex(m => m.id === cardId);
    if (mi >= 0) {
      const card = hand.missiles[mi]!;
      if (card.kind === 'arm') {
        if (!targetColor || targetColor === seat) return this.err('arm needs enemy target');
        return this.playArm(seat, mi, targetColor);
      }
      if (card.kind === 'cruise') {
        if (!targetColor || targetColor === seat || targetPlaneIndex === undefined) return this.err('cruise needs enemy plane target');
        return this.playCruise(seat, mi, targetColor, targetPlaneIndex);
      }
      // aam/sam: only used reactively in combat, not played from hand.
      return this.err('cannot play this missile directly');
    }

    return this.err('card not found');
  }

  private playArm(attacker: Color, missileIdx: number, defender: Color) {
    if (this.state.hands[defender].radars <= 0) return this.err('target has no radars');
    const m = this.state.hands[attacker].missiles.splice(missileIdx, 1)[0]!;
    const r = armRoll();
    this.log(`${attacker} fires ARM at ${defender} radar — rolled ${r.roll}`);
    if (r.success) {
      this.state.hands[defender].radars -= 1;
      this.log(`ARM success — ${defender} loses a radar (now ${this.state.hands[defender].radars})`);
    } else {
      this.log(`ARM missed`);
    }
    this.missileDeck.discard(m);
    this.commit();
  }

  private playCruise(attacker: Color, missileIdx: number, defender: Color, defPlaneIdx: number) {
    const dp = this.state.planes[defender][defPlaneIdx];
    if (!dp || dp.state !== 'onBoard') return this.err('target not on board');
    if (this.state.hands[defender].shield) {
      this.state.hands[defender].shield = false;
      const m = this.state.hands[attacker].missiles.splice(missileIdx, 1)[0]!;
      this.missileDeck.discard(m);
      this.log(`${defender} shielded the cruise missile`);
      this.commit();
      return;
    }
    const onTakeoff = isOnTakeoff(dp.progress!);
    const inLanding = isInLandingStrip(dp.progress!);
    if (!onTakeoff && !inLanding) return this.err('cruise can only target takeoff or landing-strip planes');

    const m = this.state.hands[attacker].missiles.splice(missileIdx, 1)[0]!;
    if (onTakeoff) {
      this.returnToHangar(dp);
      this.log(`Cruise auto-hits ${defender}#${defPlaneIdx + 1} on takeoff — returns to hangar`);
    } else {
      const r = cruiseLandingRoll();
      this.log(`Cruise vs landing strip — rolled ${r.roll}`);
      if (r.success) {
        this.returnToHangar(dp);
        this.log(`Cruise hit — ${defender}#${defPlaneIdx + 1} returns to hangar`);
      } else {
        this.log(`Cruise missed`);
      }
    }
    this.missileDeck.discard(m);
    this.commit();
  }

  // ---------- SAM detection ----------
  private maybeTriggerSamForMove(attacker: Color, planeIndex: number) {
    const plane = this.state.planes[attacker][planeIndex]!;
    if (plane.state !== 'onBoard' || plane.cellId === undefined) return;
    if (isInLandingStrip(plane.progress!)) return; // landing strip immune to SAM

    for (const def of this.playerSeats) {
      if (def === attacker) continue;
      const radars = this.state.hands[def].radars;
      const zoneCells = this.board.paths[def].radarZone.slice(0, radarZoneSize(radars));
      if (zoneCells.length === 0) continue;
      if (!zoneCells.includes(plane.cellId)) continue;
      // Defender has SAM in hand?
      if (!this.state.hands[def].missiles.some(m => m.kind === 'sam')) continue;
      const id = nanoid(6);
      this.pendingCombat = {
        id, kind: 'sam', attacker, defender: def,
        planeIndex, passedCellIds: [plane.cellId],
      };
      this.state.phase = 'awaitCombat';
      this.state.prompts = [{
        kind: 'combat', seat: def, combatId: id,
        description: `Enemy ${attacker} entered your radar zone — fire SAM?`,
        options: ['fire', 'skip'],
      }];
      return;
    }
  }

  // ---------- Movable plane discovery ----------
  private hangarPlaneIndices(seat: Color): number[] {
    return this.state.planes[seat]
      .filter(p => p.state === 'hangar')
      .map(p => p.index);
  }
  private movablePlaneIndices(seat: Color, _roll: number): number[] {
    return this.state.planes[seat]
      .filter(p => p.state === 'onBoard')
      .map(p => p.index);
  }

  // ---------- Inventory helpers ----------
  private spendMissile(seat: Color, kind: MissileKind): boolean {
    const idx = this.state.hands[seat].missiles.findIndex(m => m.kind === kind);
    if (idx < 0) return false;
    const m = this.state.hands[seat].missiles.splice(idx, 1)[0]!;
    this.missileDeck.discard(m);
    return true;
  }

  // ---------- Turn closure ----------
  private afterTurnAction(seat: Color) {
    // Pending re-roll from rewardFwd or six-on-die?
    if (this.pendingExtraRoll) {
      this.pendingExtraRoll = false;
      this.state.phase = 'awaitRoll';
      this.state.prompts = [];
      this.commit();
      return;
    }
    if (this.state.lastDice === 6) {
      this.state.phase = 'awaitRoll';
      this.state.prompts = [];
      this.commit();
      return;
    }
    this.state.prompts = [];
    this.state.phase = 'resolving';
    this.commit();
    this.advanceTurn();
  }

  // ---------- Victory ----------
  private checkVictory(): boolean {
    const wins: Color[] = [];
    if (this.state.options.victory === 'twoHome') {
      for (const c of this.playerSeats) {
        const home = this.state.planes[c].filter(p => p.state === 'home').length;
        if (home >= 2) wins.push(c);
      }
    } else if (this.state.options.victory === 'allHome') {
      // All 4 planes must reach home for a player to win the round.
      for (const c of this.playerSeats) {
        const planes = this.state.planes[c];
        if (planes.length > 0 && planes.every(p => p.state === 'home')) wins.push(c);
      }
    } else {
      // Timed victory: check time elapsed.
      const elapsed = Date.now() - this.state.startedAt;
      if (this.state.options.timeLimitMs && elapsed >= this.state.options.timeLimitMs) {
        let max = -1;
        for (const c of this.playerSeats) {
          const home = this.state.planes[c].filter(p => p.state === 'home').length;
          if (home > max) { max = home; wins.length = 0; wins.push(c); }
          else if (home === max) wins.push(c);
        }
      }
    }
    if (wins.length > 0) {
      this.state.winners = wins;
      this.state.phase = 'gameOver';
      this.state.prompts = [];
      this.log(`Game over — winners: ${wins.join(', ')}`);
      this.cb.onGameOver(wins);
      this.commit();
      return true;
    }
    return false;
  }

  // ---------- Errors ----------
  private err(msg: string) {
    this.log(`engine error: ${msg}`);
    this.commit();
  }
}
