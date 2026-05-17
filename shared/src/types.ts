// Shared domain types for 防空作战飞行棋

export type Color = 'red' | 'yellow' | 'blue' | 'green';
export const COLORS: Color[] = ['red', 'yellow', 'blue', 'green'];

export type CellKind =
  | 'normal'
  | 'takeoff'
  | 'jump'
  | 'shortcutEntry'
  | 'shortcutExit'
  | 'landing'
  | 'home'
  | 'missileFactory'
  | 'radarFactory'
  | 'library';

export interface Cell {
  /** Stable id used in the snapshot. */
  id: number;
  kind: CellKind;
  /** Color the cell belongs to (for color-specific cells). */
  color?: Color;
  /** Layout: cell center in board coordinates [0,1]^2. */
  x: number;
  y: number;
  /** Optional shortcut pair link (id of the matching entry/exit). */
  shortcutPair?: number;
}

export interface BoardPath {
  color: Color;
  /** Ring cell ids in walking order from this color's takeoff (length 84). */
  ring: number[];
  /** Landing-strip cell ids (length 4). */
  landing: number[];
  /** Home cell id. */
  home: number;
  /** Cell id of the takeoff for this color (== ring[0]). */
  takeoff: number;
  /** Hangar slot positions (length 4). */
  hangar: { x: number; y: number }[];
  /** Cells inside this color's "radar zone" sorted by distance from base. Up to 7 cells. */
  radarZone: number[];
}

export interface BoardSnapshot {
  cells: Cell[];
  paths: Record<Color, BoardPath>;
}

// ----- Cards -----

export type MissileKind = 'aam' | 'sam' | 'arm' | 'cruise';
export type RewardKind =
  | 'rerollFwd'   // (1) reroll & advance
  | 'fwd2'        // (2) +2
  | 'fwd4'        // (3) +4
  | 'fwd6'        // (4) +6
  | 'gainMissile' // (5) gain a random missile
  | 'gainRadar'   // (6) gain a radar
  | 'enemySkip'   // (7) target opponent skips one round
  | 'shield';     // (8) defend one attack
export type PunishmentKind =
  | 'rerollBwd'   // (1) reroll & retreat
  | 'bwd2'        // (2) -2
  | 'bwd4'        // (3) -4
  | 'bwd6'        // (4) -6
  | 'toTakeoff'   // (5) back to takeoff
  | 'selfSkip'    // (6) skip one round
  | 'loseMissile' // (7) lose a missile
  | 'loseRadar';  // (8) lose a radar

export type CardId = string;

export interface MissileCard { id: CardId; type: 'missile'; kind: MissileKind; }
export interface RadarCard   { id: CardId; type: 'radar'; }
export interface RewardCard  { id: CardId; type: 'reward'; kind: RewardKind; }
export interface PunishmentCard { id: CardId; type: 'punishment'; kind: PunishmentKind; }
export type AnyCard = MissileCard | RadarCard | RewardCard | PunishmentCard;

// ----- Plane -----

export type PlaneState = 'hangar' | 'onBoard' | 'home';

export interface Plane {
  /** 0..3 within the color. */
  index: number;
  color: Color;
  state: PlaneState;
  /** Cell id when state==='onBoard'. */
  cellId?: number;
  /** Walked steps from takeoff (used for landing-strip detection). */
  progress?: number;
  /** Whether the plane is "perched" on top of an enemy stack waiting to advance. */
  perched?: boolean;
}

// ----- Player / Game -----

export interface PlayerPublic {
  id: string;
  nickname: string;
  color: Color;
  connected: boolean;
  isBot: boolean;
}

export interface PlayerHand {
  /** Held cards visible only to the owner; counts shared with everyone. */
  missiles: MissileCard[];
  radars: number;
  heldRewards: RewardCard[];     // (5)-(8)
  heldPunishments: PunishmentCard[]; // (7)-(8)
  shield: boolean;               // active "defend one attack"
  skipRounds: number;
}

export interface GameOptions {
  takeoffNumbers: number[];   // e.g. [2,4,6] | [5,6] | [6]
  turnTimeoutMs: number;      // default 60000
  victory: 'oneHome' | 'twoHome' | 'allHome' | 'timed';
  timeLimitMs?: number;       // for 'timed' victory
  fillBots: boolean;
}

export interface DiceRoll { value: number; chain: number; /** 1st, 2nd, 3rd consecutive 6 */ }

export type Phase =
  | 'lobby'
  | 'awaitRoll'
  | 'awaitTakeoffChoice'
  | 'awaitMoveChoice'
  | 'resolving'
  | 'awaitCardActions'
  | 'awaitCombat'
  | 'awaitQA'
  | 'gameOver';

/** Outstanding prompt the engine is waiting on. */
export type Prompt =
  | { kind: 'takeoff'; seat: Color; planes: number[] }
  | { kind: 'move'; seat: Color; planes: number[]; roll: number }
  | { kind: 'card'; seat: Color; cardId: CardId }
  | { kind: 'combat'; seat: Color; combatId: string; description: string; options: string[] }
  | { kind: 'qa'; seat: Color; questionId: string; prompt: string; options: string[] };

export interface DeckCounts {
  aam: number; sam: number; arm: number; cruise: number;
  radar: number; reward: number; punishment: number; questions: number;
}

export interface GameState {
  phase: Phase;
  turn: Color;             // whose turn it is
  diceChain: number;       // how many sixes in a row this turn
  lastDice?: number;
  planes: Record<Color, Plane[]>;
  hands: Record<Color, PlayerHand>;
  deckCounts: DeckCounts;
  prompts: Prompt[];        // 0..1 active prompt at a time generally
  log: string[];            // newest last; capped
  winners: Color[];
  startedAt: number;
  options: GameOptions;
}

// ----- Lobby / Room -----

export interface RoomPublic {
  id: string;
  hostId: string;
  seats: { color: Color; player?: PlayerPublic; ready: boolean }[];
  options: GameOptions;
  inGame: boolean;
  /** Private rooms are joinable only via direct room code, never via lobby browse. */
  private: boolean;
}

/** Compact summary used by the lobby browser. */
export interface PublicRoomSummary {
  id: string;
  hostNickname: string;
  seated: number;
  capacity: number;
  inGame: boolean;
}

// ----- Q&A schema -----

export interface QuestionRow {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
}
