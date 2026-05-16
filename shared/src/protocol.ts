import { z } from 'zod';
import type { GameState, RoomPublic, BoardSnapshot, Color } from './types.js';

// ====== Client → Server ======

export const C2S = {
  LobbyCreate:   'lobby:create',
  LobbyJoin:     'lobby:join',
  RoomLeave:     'room:leave',
  RoomSetOpts:   'room:setOptions',
  RoomReady:     'room:ready',
  RoomClaimSeat: 'room:claimSeat',
  RoomStart:     'room:start',
  RoomRestart:   'room:restart',
  SessionResume: 'session:resume',
  TurnRoll:      'turn:roll',
  TurnTakeoff:   'turn:chooseTakeoff',
  TurnMove:      'turn:choosePlane',
  CardPlay:      'card:play',
  CombatRespond: 'combat:respond',
  QAAnswer:      'qa:answer',
  ChatSay:       'chat:say',
} as const;

export type C2SEvent = typeof C2S[keyof typeof C2S];

// Payload schemas
export const LobbyCreateZ = z.object({
  nickname: z.string().min(1).max(16),
});
export const LobbyJoinZ = z.object({
  roomId: z.string().min(4).max(8),
  nickname: z.string().min(1).max(16),
});
export const RoomClaimSeatZ = z.object({
  color: z.enum(['red','yellow','blue','green'] as const),
});
export const RoomReadyZ = z.object({ ready: z.boolean() });
export const RoomSetOptsZ = z.object({
  takeoffNumbers: z.array(z.number().int().min(1).max(6)).min(1).max(6),
  turnTimeoutMs: z.number().int().min(10_000).max(300_000),
  victory: z.enum(['twoHome','allHome','timed'] as const),
  timeLimitMs: z.number().int().optional(),
  fillBots: z.boolean(),
});
export const TurnRollZ = z.object({});
export const TurnTakeoffZ = z.object({ planeIndex: z.number().int().min(0).max(3) });
export const TurnMoveZ    = z.object({ planeIndex: z.number().int().min(0).max(3) });
export const CardPlayZ    = z.object({
  cardId: z.string(),
  /** target color when applicable (enemy skip / arm / cruise / aam target plane). */
  targetColor: z.enum(['red','yellow','blue','green'] as const).optional(),
  targetPlaneIndex: z.number().int().min(0).max(3).optional(),
  /** for arm: which radar slot (0-based). */
  targetRadarIndex: z.number().int().optional(),
});
export const CombatRespondZ = z.object({
  combatId: z.string(),
  choice: z.string(),
  /** Optional follow-up data, e.g. plane index when defender picks counter target. */
  data: z.record(z.any()).optional(),
});
export const QAAnswerZ = z.object({
  questionId: z.string(),
  answerIndex: z.number().int().min(0).max(3),
});
export const ChatSayZ = z.object({ message: z.string().min(1).max(200) });
export const SessionResumeZ = z.object({
  playerId: z.string().min(1).max(32),
  nickname: z.string().min(1).max(16).optional(),
});

// ====== Server → Client ======

export const S2C = {
  Welcome:    'welcome',
  RoomState:  'room:state',
  GameState:  'game:state',
  Board:      'game:board',
  Prompt:     'prompt',
  EventDice:  'event:dice',
  EventCard:  'event:cardDrawn',
  EventLog:   'event:log',
  Chat:       'chat',
  Error:      'error',
} as const;

export type S2CEvent = typeof S2C[keyof typeof S2C];

export interface WelcomePayload  { playerId: string; }
export interface RoomStatePayload { room: RoomPublic | null; }
export interface GameStatePayload { state: GameState | null; }
export interface BoardPayload     { board: BoardSnapshot; }
export interface DicePayload      { seat: Color; value: number; chain: number; }
export interface CardDrawnPayload {
  seat: Color;
  cardType: 'missile' | 'radar' | 'reward' | 'punishment';
  cardKind?: string;
}
export interface LogPayload       { line: string; }
export interface ChatPayload      { from: string; nickname: string; message: string; ts: number; }
export interface ErrorPayload     { code: string; message: string; }
