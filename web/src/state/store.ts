// Client-side store. Single zustand store reflecting the latest server snapshots
// + UI navigation state (lobby vs room vs game) + chat log + transient prompts.

import { create } from 'zustand';
import type {
  RoomPublic, GameState, BoardSnapshot, Color, Prompt, GameOptions, PublicRoomSummary,
} from '@fkzz/shared';
import { getSocket, setStoredPlayerId, getStoredPlayerId } from '../net/socket';
import { C2S, S2C } from '@fkzz/shared';
import { translate } from '../i18n';

export type Screen = 'lobby' | 'room' | 'game';

interface ChatLine { from: string; nickname: string; message: string; ts: number; }

interface Store {
  playerId: string;
  nickname: string;
  screen: Screen;
  room: RoomPublic | null;
  board: BoardSnapshot | null;
  state: GameState | null;
  log: string[];
  chat: ChatLine[];
  myCardEvents: { cardType: string; cardKind?: string; ts: number }[];
  lastError: string | null;

  /** Public-room browser entries (only valid while subscribed via lobby:subscribe). */
  publicRooms: PublicRoomSummary[];

  /** UI language. Persisted in localStorage. Default 'zh'. */
  locale: 'zh' | 'en';
  setLocale(l: 'zh' | 'en'): void;

  hoverPlaneIdx: number | null;
  setHoverPlane(idx: number | null): void;

  setNickname(n: string): void;
  createRoom(nickname: string, isPrivate?: boolean, avatar?: string): void;
  joinRoom(roomId: string, nickname: string, avatar?: string): void;
  leaveRoom(): void;
  claimSeat(color: Color): void;
  setReady(ready: boolean): void;
  setOptions(options: GameOptions): void;
  startGame(): void;
  /** Server-side restart after gameOver — keeps seats & options. */
  restartGame(): void;
  rollDice(): void;
  chooseTakeoff(planeIndex: number): void;
  choosePlane(planeIndex: number): void;
  combatRespond(combatId: string, choice: string, data?: Record<string, unknown>): void;
  qaAnswer(questionId: string, answerIndex: number): void;
  playCard(cardId: string, opts?: { targetColor?: Color; targetPlaneIndex?: number; targetRadarIndex?: number }): void;
  chatSay(message: string): void;

  /** Lobby-browser pub/sub. */
  subscribeLobby(): void;
  unsubscribeLobby(): void;

  mySeat(): Color | null;
  isMyTurn(): boolean;
  myPrompt(): Prompt | null;
}

export const useStore = create<Store>((set, get) => {
  const sock = getSocket();

  // ---- Dice-spin state-buffering ----
  // When the server resolves a dice roll it broadcasts a single GameState that
  // bundles the new dice value AND its consequences (phase change, new prompts,
  // moved planes, etc.). To make the dice animation feel weight-y we want every
  // viewer to see the spin finish before any other UI changes.
  //
  // Strategy on receiving a roll-bearing GameState:
  //   1. Immediately publish ONLY the dice-trigger fields (lastDice/diceChain)
  //      so each client's ActionPanel can start/refresh its spin animation.
  //   2. Buffer the full new state and apply it after SPIN_DEFER_MS — matching
  //      the ActionPanel's spin-tail length so prompts/phase appear exactly as
  //      the dice settles.
  const SPIN_DEFER_MS = 800;
  let pendingState: GameState | null = null;
  let pendingTimer: number | null = null;

  sock.on(S2C.Welcome, ({ playerId }) => {
    if (playerId) {
      set({ playerId });
      setStoredPlayerId(playerId);
    } else {
      setStoredPlayerId(null);
      set({ playerId: '' });
    }
  });
  sock.on(S2C.RoomState, ({ room }) => {
    const prev = get().room;
    set({ room });
    if (room && get().screen === 'lobby') set({ screen: room.inGame ? 'game' : 'room' });
    if (room?.inGame && get().screen === 'room') set({ screen: 'game' });
    if (!room) {
      // If the server forcibly tore the room down (e.g. host abandon timeout),
      // surface a one-shot toast so the player understands why they were ejected.
      if (prev) {
        const msg = translate(get().locale, 'room.disbanded');
        set({ lastError: msg });
        window.setTimeout(() => {
          // Only clear if nothing newer has been set in the meantime.
          if (get().lastError === msg) set({ lastError: null });
        }, 5000);
      }
      set({ screen: 'lobby' });
    }
  });
  sock.on(S2C.GameState, ({ state }) => {
    if (!state) {
      // Server cleared state — drop any pending buffered update too.
      if (pendingTimer !== null) { clearTimeout(pendingTimer); pendingTimer = null; }
      pendingState = null;
      set({ state });
      return;
    }
    // Reference state for comparison: latest authoritative knowledge we have,
    // which is the buffered state if one exists (its dice fields were already
    // partially leaked into `get().state`), otherwise the live store state.
    const ref = pendingState ?? get().state;
    const isRoll = !!ref && (
      ref.lastDice !== state.lastDice ||
      ref.diceChain !== state.diceChain
    );
    if (isRoll) {
      // Phase 1: leak ONLY the dice-trigger fields so spinners react.
      const cur = get().state;
      if (cur) {
        set({
          state: {
            ...cur,
            lastDice: state.lastDice,
            diceChain: state.diceChain,
          } as GameState,
        });
      } else {
        // No prior state to merge into — just publish the full one.
        set({ state });
        pendingState = null;
        return;
      }
      // Phase 2: defer the full update until the spin tail completes.
      pendingState = state;
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(() => {
        const next = pendingState;
        pendingState = null;
        pendingTimer = null;
        if (next) set({ state: next });
      }, SPIN_DEFER_MS);
    } else {
      // Non-roll update (e.g. card play, combat resolution): apply immediately,
      // dropping any unrelated pending buffer.
      if (pendingTimer !== null) { clearTimeout(pendingTimer); pendingTimer = null; }
      pendingState = null;
      set({ state });
    }
    if (get().screen !== 'game') set({ screen: 'game' });
  });
  sock.on(S2C.Board, ({ board }) => set({ board }));
  sock.on(S2C.EventLog, ({ line }) => {
    set(s => ({ log: [...s.log.slice(-200), line] }));
  });
  sock.on(S2C.EventCard, (ev) => {
    set(s => ({ myCardEvents: [...s.myCardEvents.slice(-50), { cardType: ev.cardType, cardKind: ev.cardKind, ts: Date.now() }] }));
  });
  sock.on(S2C.Chat, (line) => set(s => ({ chat: [...s.chat.slice(-200), line] })));
  // Server replays full log + chat after a session resume / reconnect so the
  // panel rehydrates after a page refresh.
  sock.on(S2C.History, ({ log, chat }: { log: string[]; chat: ChatLine[] }) => {
    set({ log: log.slice(-200), chat: chat.slice(-200) });
  });
  sock.on(S2C.Error, ({ code, message }) => set({ lastError: `${code}: ${message}` }));
  sock.on(S2C.LobbyList, ({ rooms }) => set({ publicRooms: rooms }));

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
    publicRooms: [],
    locale: ((): 'zh' | 'en' => {
      const v = (typeof localStorage !== 'undefined') ? localStorage.getItem('fkzz.locale') : null;
      return v === 'en' || v === 'zh' ? v : 'zh';
    })(),
    setLocale(l) {
      if (typeof localStorage !== 'undefined') localStorage.setItem('fkzz.locale', l);
      set({ locale: l });
    },
    hoverPlaneIdx: null,
    setHoverPlane(idx) { set({ hoverPlaneIdx: idx }); },

    setNickname(n) {
      localStorage.setItem('fkzz.nickname', n);
      set({ nickname: n });
    },
    createRoom(nickname, isPrivate, avatar) { sock.emit(C2S.LobbyCreate, { nickname, isPrivate: !!isPrivate, avatar }); },
    joinRoom(roomId, nickname, avatar) { sock.emit(C2S.LobbyJoin, { roomId: roomId.toUpperCase(), nickname, avatar }); },
    leaveRoom() {
      sock.emit(C2S.RoomLeave);
      setStoredPlayerId(null);
      set({ room: null, board: null, state: null, screen: 'lobby', playerId: '' });
    },
    claimSeat(color) { sock.emit(C2S.RoomClaimSeat, { color }); },
    setReady(ready) { sock.emit(C2S.RoomReady, { ready }); },
    setOptions(options) { sock.emit(C2S.RoomSetOpts, options); },
    startGame() { sock.emit(C2S.RoomStart); },
    restartGame() { sock.emit(C2S.RoomRestart); },
    rollDice() { sock.emit(C2S.TurnRoll, {}); },
    chooseTakeoff(planeIndex) { sock.emit(C2S.TurnTakeoff, { planeIndex }); },
    choosePlane(planeIndex) { sock.emit(C2S.TurnMove, { planeIndex }); },
    combatRespond(combatId, choice, data) { sock.emit(C2S.CombatRespond, { combatId, choice, data }); },
    qaAnswer(questionId, answerIndex) { sock.emit(C2S.QAAnswer, { questionId, answerIndex }); },
    playCard(cardId, opts) { sock.emit(C2S.CardPlay, { cardId, ...opts }); },
    chatSay(message) { sock.emit(C2S.ChatSay, { message }); },

    subscribeLobby() { sock.emit(C2S.LobbySubscribe); },
    unsubscribeLobby() { sock.emit(C2S.LobbyUnsubscribe); },

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
