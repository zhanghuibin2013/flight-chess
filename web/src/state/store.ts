// Client-side store. Single zustand store reflecting the latest server snapshots
// + UI navigation state (lobby vs room vs game) + chat log + transient prompts.

import { create } from 'zustand';
import type {
  RoomPublic, GameState, BoardSnapshot, Color, Prompt, GameOptions,
} from '@fkzz/shared';
import { getSocket, setStoredPlayerId, getStoredPlayerId } from '../net/socket';
import { C2S, S2C } from '@fkzz/shared';

export type Screen = 'lobby' | 'room' | 'game';

interface ChatLine { from: string; nickname: string; message: string; ts: number; }

interface Store {
  // identity
  playerId: string;
  nickname: string;

  // navigation
  screen: Screen;

  // lobby/room
  room: RoomPublic | null;

  // game
  board: BoardSnapshot | null;
  state: GameState | null;
  log: string[];
  chat: ChatLine[];

  // transient hand info (cards drawn for ME)
  myCardEvents: { cardType: string; cardKind?: string; ts: number }[];

  // last error
  lastError: string | null;

  // transient UI: which own-plane the user is hovering in the action panel
  // (used to render a hover-preview move-curve on the board).
  hoverPlaneIdx: number | null;
  setHoverPlane(idx: number | null): void;

  // actions
  setNickname(n: string): void;
  createRoom(nickname: string): void;
  joinRoom(roomId: string, nickname: string): void;
  leaveRoom(): void;
  claimSeat(color: Color): void;
  setReady(ready: boolean): void;
  setOptions(options: GameOptions): void;
  startGame(): void;
  rollDice(): void;
  chooseTakeoff(planeIndex: number): void;
  choosePlane(planeIndex: number): void;
  combatRespond(combatId: string, choice: string, data?: Record<string, unknown>): void;
  qaAnswer(questionId: string, answerIndex: number): void;
  playCard(cardId: string, opts?: { targetColor?: Color; targetPlaneIndex?: number; targetRadarIndex?: number }): void;
  chatSay(message: string): void;

  /** Local seat color of the current viewer, derived from room.seats. */
  mySeat(): Color | null;
  isMyTurn(): boolean;
  myPrompt(): Prompt | null;
}

export const useStore = create<Store>((set, get) => {
  const sock = getSocket();

  sock.on(S2C.Welcome, ({ playerId }) => {
    if (playerId) {
      set({ playerId });
      setStoredPlayerId(playerId);
    } else {
      // Server told us our stored session is gone. Clear it so the next
      // connect doesn't loop on session:resume.
      setStoredPlayerId(null);
      set({ playerId: '' });
    }
  });
  sock.on(S2C.RoomState, ({ room }) => {
    set({ room });
    if (room && get().screen === 'lobby') set({ screen: room.inGame ? 'game' : 'room' });
    if (room?.inGame && get().screen === 'room') set({ screen: 'game' });
    if (!room) set({ screen: 'lobby' });
  });
  sock.on(S2C.GameState, ({ state }) => {
    set({ state });
    if (state) {
      // sync screen
      if (get().screen !== 'game') set({ screen: 'game' });
    }
  });
  sock.on(S2C.Board, ({ board }) => set({ board }));
  sock.on(S2C.EventLog, ({ line }) => {
    set(s => ({ log: [...s.log.slice(-200), line] }));
  });
  sock.on(S2C.EventCard, (ev) => {
    set(s => ({ myCardEvents: [...s.myCardEvents.slice(-50), { cardType: ev.cardType, cardKind: ev.cardKind, ts: Date.now() }] }));
  });
  sock.on(S2C.Chat, (line) => set(s => ({ chat: [...s.chat.slice(-200), line] })));
  sock.on(S2C.Error, ({ code, message }) => set({ lastError: `${code}: ${message}` }));

  return {
    playerId: getStoredPlayerId() ?? '',
    nickname: localStorage.getItem('fkzz.nickname') ?? '',
    screen: 'lobby',
    room: null,
    board: null,
    state: null,
    log: [],
    chat: [],
    myCardEvents: [],
    lastError: null,
    hoverPlaneIdx: null,
    setHoverPlane(idx) { set({ hoverPlaneIdx: idx }); },

    setNickname(n) {
      localStorage.setItem('fkzz.nickname', n);
      set({ nickname: n });
    },
    createRoom(nickname) {
      sock.emit(C2S.LobbyCreate, { nickname });
    },
    joinRoom(roomId, nickname) {
      sock.emit(C2S.LobbyJoin, { roomId: roomId.toUpperCase(), nickname });
    },
    leaveRoom() {
      sock.emit(C2S.RoomLeave);
      // Clear local session so we don't auto-resume into the room we just left.
      setStoredPlayerId(null);
      set({ room: null, board: null, state: null, screen: 'lobby', playerId: '' });
    },
    claimSeat(color) {
      sock.emit(C2S.RoomClaimSeat, { color });
    },
    setReady(ready) {
      sock.emit(C2S.RoomReady, { ready });
    },
    setOptions(options) {
      sock.emit(C2S.RoomSetOpts, options);
    },
    startGame() {
      sock.emit(C2S.RoomStart);
    },
    rollDice() {
      sock.emit(C2S.TurnRoll, {});
    },
    chooseTakeoff(planeIndex) {
      sock.emit(C2S.TurnTakeoff, { planeIndex });
    },
    choosePlane(planeIndex) {
      sock.emit(C2S.TurnMove, { planeIndex });
    },
    combatRespond(combatId, choice, data) {
      sock.emit(C2S.CombatRespond, { combatId, choice, data });
    },
    qaAnswer(questionId, answerIndex) {
      sock.emit(C2S.QAAnswer, { questionId, answerIndex });
    },
    playCard(cardId, opts) {
      sock.emit(C2S.CardPlay, { cardId, ...opts });
    },
    chatSay(message) {
      sock.emit(C2S.ChatSay, { message });
    },

    mySeat() {
      const room = get().room;
      const pid = get().playerId;
      if (!room) return null;
      const s = room.seats.find(s => s.player?.id === pid);
      return s ? s.color : null;
    },
    isMyTurn() {
      const seat = get().mySeat();
      return !!seat && get().state?.turn === seat;
    },
    myPrompt() {
      const seat = get().mySeat();
      const prompts = get().state?.prompts ?? [];
      return prompts.find(p => p.seat === seat) ?? null;
    },
  };
});
