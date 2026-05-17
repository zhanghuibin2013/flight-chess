// In-memory room registry: lobby + game lifecycle.

import { nanoid } from 'nanoid';
import type {
  Color, GameOptions, PlayerPublic, RoomPublic, QuestionRow, PublicRoomSummary,
  ChatPayload,
} from '@fkzz/shared';
import { COLORS } from '@fkzz/shared';
import { GameEngine, EngineCallbacks } from './game/engine.js';
import { BotDriver } from './game/botDriver.js';

export interface Player {
  id: string;          // stable player id (cookie-style)
  socketId?: string;   // current socket
  nickname: string;
  connected: boolean;
  isBot: boolean;
  /** Optional avatar emoji chosen in the lobby. Used to render player
   *  badges next to each base on the board. */
  avatar?: string;
  /** When true (humans only), the server auto-drives this seat. Bots always
   *  behave like autopilot regardless of this flag. */
  autopilot?: boolean;
}

export interface Seat {
  color: Color;
  player?: Player;
  ready: boolean;
}

export interface Room {
  id: string;
  hostId: string;
  seats: Seat[];               // length 4, fixed colors
  options: GameOptions;
  engine?: GameEngine;
  /** Server-side AI driver attached when the engine is created. */
  botDriver?: BotDriver;
  /** Private rooms are joinable only by direct room-code entry; never browsed. */
  isPrivate: boolean;
  /** Unix ms when the host stopped being present (explicit leave or socket
   *  disconnect). While set, the room is in a "host-abandoned" countdown
   *  state. Cleared as soon as the host returns. The actual disband timer
   *  lives in the handlers layer (it owns the io reference). */
  hostAbandonedAt?: number;
  /** Persisted server-side log lines so a client refreshing / reconnecting
   *  can rehydrate the chat panel. Capped at HISTORY_LIMIT entries. */
  logLines: string[];
  /** Persisted server-side chat messages. Capped at HISTORY_LIMIT entries. */
  chatLines: ChatPayload[];
}

/** Cap for persisted log/chat history per room. Mirrors the client-side
 *  trimming so the server never sends more than the client would keep. */
const HISTORY_LIMIT = 200;

const DEFAULT_OPTIONS: GameOptions = {
  takeoffNumbers: [2, 4, 6],
  turnTimeoutMs: 60_000,
  victory: 'oneHome',
  fillBots: false,
  // Defaults follow the printed rulebook (说明书):
  //  - 撞机：仅撞迭机时只有一架对方机退回；普通撞机两机都退（false）
  collisionAllEnemies: false,
};

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private players = new Map<string, Player>();
  private socketToPlayer = new Map<string, string>(); // socketId -> playerId
  private playerToRoom = new Map<string, string>();

  /** Resolve a player by socket. Creates an anonymous record if none. */
  attachSocket(socketId: string, nickname: string, avatar?: string): Player {
    const existingPid = this.socketToPlayer.get(socketId);
    const existing = existingPid ? this.players.get(existingPid) : undefined;
    const player: Player = existing ?? {
      id: nanoid(10), socketId, nickname, connected: true, isBot: false,
    };
    if (!existing) this.players.set(player.id, player);
    player.socketId = socketId;
    player.connected = true;
    if (nickname) player.nickname = nickname;
    if (avatar) player.avatar = avatar;
    this.socketToPlayer.set(socketId, player.id);
    return player;
  }

  detachSocket(socketId: string) {
    const pid = this.socketToPlayer.get(socketId);
    if (!pid) return;
    const player = this.players.get(pid);
    if (player && player.socketId === socketId) {
      player.connected = false;
      player.socketId = undefined;
    }
    this.socketToPlayer.delete(socketId);
  }

  /** Re-bind an existing player record (by playerId) to a new socket.
   *  Used after the client refreshes / reconnects.
   *  Returns the player on success, or null if the playerId is unknown. */
  resumeSession(playerId: string, socketId: string, nickname?: string, avatar?: string): Player | null {
    const player = this.players.get(playerId);
    if (!player) return null;
    // Detach previous socket binding if any.
    if (player.socketId && player.socketId !== socketId) {
      this.socketToPlayer.delete(player.socketId);
    }
    player.socketId = socketId;
    player.connected = true;
    if (nickname) player.nickname = nickname;
    if (avatar) player.avatar = avatar;
    this.socketToPlayer.set(socketId, player.id);
    // Re-link seats: the seat object holds the same Player reference,
    // so socketId/connected updates above are already visible there.
    return player;
  }

  playerBySocket(socketId: string): Player | undefined {
    const pid = this.socketToPlayer.get(socketId);
    return pid ? this.players.get(pid) : undefined;
  }

  roomOfPlayer(playerId: string): Room | undefined {
    const rid = this.playerToRoom.get(playerId);
    return rid ? this.rooms.get(rid) : undefined;
  }

  createRoom(hostPlayerId: string, isPrivate = false): Room {
    const id = this.generateRoomId();
    const room: Room = {
      id,
      hostId: hostPlayerId,
      seats: COLORS.map(c => ({ color: c, ready: false })),
      options: { ...DEFAULT_OPTIONS },
      isPrivate,
      logLines: [],
      chatLines: [],
    };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId: string, player: Player): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    // If already seated, just return.
    if (room.seats.some(s => s.player?.id === player.id)) {
      this.playerToRoom.set(player.id, room.id);
      return room;
    }
    // Place into first empty seat.
    const empty = room.seats.find(s => !s.player);
    if (!empty) return null;
    empty.player = player;
    this.playerToRoom.set(player.id, room.id);
    return room;
  }

  claimSeat(roomId: string, player: Player, color: Color): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const target = room.seats.find(s => s.color === color);
    if (!target) return false;
    if (target.player && target.player.id !== player.id) return false;
    // Vacate any prior seat.
    for (const s of room.seats) {
      if (s.player?.id === player.id && s !== target) {
        s.player = undefined;
        s.ready = false;
      }
    }
    target.player = player;
    return true;
  }

  /** Add a synthetic bot player into an empty seat. Host-only, lobby-only. */
  addBot(roomId: string, hostPlayerId: string, color: Color): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostPlayerId) return false;
    if (room.engine && room.engine.state.phase !== 'gameOver') return false;
    const target = room.seats.find(s => s.color === color);
    if (!target || target.player) return false;
    const id = 'bot_' + nanoid(8);
    const bot: Player = {
      id,
      // Display name; the web client substitutes the localized 'player.bot'
      // string whenever rendering a player flagged isBot.
      nickname: 'Computer',
      connected: true,
      isBot: true,
    };
    this.players.set(bot.id, bot);
    target.player = bot;
    target.ready = true;
    return true;
  }

  /** Remove a bot from a seat. Host-only, lobby-only. */
  removeBot(roomId: string, hostPlayerId: string, color: Color): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostPlayerId) return false;
    if (room.engine && room.engine.state.phase !== 'gameOver') return false;
    const target = room.seats.find(s => s.color === color);
    if (!target || !target.player || !target.player.isBot) return false;
    const botId = target.player.id;
    target.player = undefined;
    target.ready = false;
    this.players.delete(botId);
    return true;
  }

  /** Toggle the autopilot flag for a seated human. */
  setAutopilot(roomId: string, playerId: string, enabled: boolean): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const seat = room.seats.find(s => s.player?.id === playerId);
    if (!seat || !seat.player) return false;
    if (seat.player.isBot) return false; // bots are always "on"
    seat.player.autopilot = enabled;
    return true;
  }

  /** True when the seat's occupant is a bot or has autopilot enabled. */
  isSeatBot(room: Room, color: Color): boolean {
    const s = room.seats.find(x => x.color === color);
    if (!s || !s.player) return false;
    return !!s.player.isBot || !!s.player.autopilot;
  }

  setReady(roomId: string, playerId: string, ready: boolean): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const seat = room.seats.find(s => s.player?.id === playerId);
    if (!seat) return false;
    seat.ready = ready;
    return true;
  }

  setOptions(roomId: string, hostPlayerId: string, options: Partial<GameOptions> & Pick<GameOptions, 'takeoffNumbers' | 'turnTimeoutMs' | 'victory' | 'fillBots'>): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostPlayerId) return false;
    // Merge incoming options over the room's current options so optional
    // newer fields (e.g. collision toggles) keep their previous value when
    // an older client omits them. Final fallback is DEFAULT_OPTIONS.
    room.options = {
      ...DEFAULT_OPTIONS,
      ...room.options,
      ...options,
      collisionAllEnemies: options.collisionAllEnemies ?? room.options.collisionAllEnemies ?? DEFAULT_OPTIONS.collisionAllEnemies,
    };
    return true;
  }

  startGame(roomId: string, hostPlayerId: string, questions: QuestionRow[], cb: EngineCallbacks): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostPlayerId) return false;
    const seated = room.seats.filter(s => s.player);
    if (seated.length < 2) return false;
    if (!seated.every(s => s.ready || s.player?.id === room.hostId)) return false;

    // Wrap the network callbacks so the bot driver also gets every commit.
    const seats = seated.map(s => s.color);
    if (room.botDriver) room.botDriver.stop();
    let driver: BotDriver | null = null;
    const wrapped: EngineCallbacks = {
      onState: (state) => { cb.onState(state); driver?.tick(state); },
      onEvent: cb.onEvent,
      onGameOver: cb.onGameOver,
    };
    room.engine = new GameEngine(room.options, seats, questions, wrapped);
    driver = new BotDriver(room.engine, (color) => this.isSeatBot(room, color));
    room.botDriver = driver;
    // Engine constructor doesn't emit onState, so kick the driver explicitly
    // with the initial state. Otherwise a bot-first opening turn would stall.
    driver.tick(room.engine.state);
    return true;
  }

  /**
   * Restart a finished game with the same seats and options.
   * Any seated player may trigger this once the previous game is over.
   * Resets ready state so the lobby flow stays consistent.
   */
  restartGame(roomId: string, requesterId: string, questions: QuestionRow[], cb: EngineCallbacks): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    // Requester must be seated in this room.
    const requesterSeat = room.seats.find(s => s.player?.id === requesterId);
    if (!requesterSeat) return false;
    // Only allow restart when the prior game has actually ended.
    if (!room.engine || room.engine.state.phase !== 'gameOver') return false;
    const seated = room.seats.filter(s => s.player);
    if (seated.length < 2) return false;
    const seats = seated.map(s => s.color);
    if (room.botDriver) room.botDriver.stop();
    let driver: BotDriver | null = null;
    const wrapped: EngineCallbacks = {
      onState: (state) => { cb.onState(state); driver?.tick(state); },
      onEvent: cb.onEvent,
      onGameOver: cb.onGameOver,
    };
    room.engine = new GameEngine(room.options, seats, questions, wrapped);
    driver = new BotDriver(room.engine, (color) => this.isSeatBot(room, color));
    room.botDriver = driver;
    // Auto-ready everyone since they explicitly chose to play again.
    for (const s of room.seats) {
      if (s.player) s.ready = true;
    }
    // Kick the driver with the fresh initial state (see startGame).
    driver.tick(room.engine.state);
    return true;
  }

  leaveRoom(playerId: string) {
    const rid = this.playerToRoom.get(playerId);
    if (!rid) return;
    const room = this.rooms.get(rid);
    if (!room) return;
    for (const s of room.seats) {
      if (s.player?.id === playerId) {
        s.player = undefined;
        s.ready = false;
      }
    }
    this.playerToRoom.delete(playerId);
    // GC empty rooms (no engine running). Treat seats holding only bots as
    // empty — a room with no humans should not linger.
    if (!room.engine && room.seats.every(s => !s.player || s.player.isBot)) {
      // Drop any leftover bot player records before GCing the room.
      for (const s of room.seats) {
        if (s.player?.isBot) this.players.delete(s.player.id);
      }
      this.rooms.delete(rid);
    }
  }

  /** Mark the room as host-abandoned (handlers manages the actual timer). */
  markHostAbandoned(roomId: string, ts = Date.now()): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.hostAbandonedAt = ts;
  }

  /** Clear the host-abandoned flag once the host has rejoined. */
  clearHostAbandoned(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.hostAbandonedAt = undefined;
  }

  /** Whether the host currently occupies a seat AND has a live socket.
   *  Used to decide whether to start an abandon timer. */
  isHostPresent(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const seat = room.seats.find(s => s.player?.id === room.hostId);
    return !!seat && !!seat.player?.connected;
  }

  /** Tear down a room: collect lingering socket ids for the caller to push
   *  a final RoomState=null, then unlink everyone and drop the room. */
  disbandRoom(roomId: string): { socketIds: string[]; playerIds: string[] } {
    const room = this.rooms.get(roomId);
    if (!room) return { socketIds: [], playerIds: [] };
    if (room.botDriver) { room.botDriver.stop(); room.botDriver = undefined; }
    const socketIds: string[] = [];
    const playerIds: string[] = [];
    for (const seat of room.seats) {
      if (seat.player) {
        if (seat.player.socketId) socketIds.push(seat.player.socketId);
        playerIds.push(seat.player.id);
        this.playerToRoom.delete(seat.player.id);
        if (seat.player.isBot) this.players.delete(seat.player.id);
      }
    }
    this.rooms.delete(roomId);
    return { socketIds, playerIds };
  }

  publicRoom(room: Room): RoomPublic {
    return {
      id: room.id,
      hostId: room.hostId,
      seats: room.seats.map(s => ({
        color: s.color,
        player: s.player ? this.publicPlayer(s.player) : undefined,
        ready: s.ready,
      })),
      options: room.options,
      inGame: !!room.engine,
      private: room.isPrivate,
      hostAbandonedAt: room.hostAbandonedAt,
    };
  }
  private publicPlayer(p: Player): PlayerPublic {
    return {
      id: p.id,
      nickname: p.nickname,
      color: 'red' /*overwritten by seat*/,
      connected: p.connected,
      isBot: p.isBot,
      avatar: p.avatar,
      autopilot: p.autopilot,
    };
  }

  /** Compact list of NON-private rooms for the lobby browser. Excludes rooms
   *  that have already started (so spectators don't accidentally walk into a
   *  game in progress) and rooms whose seats are entirely empty. */
  listPublicRooms(): PublicRoomSummary[] {
    const out: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPrivate) continue;
      if (room.engine) continue; // already in-game
      const seated = room.seats.filter(s => s.player).length;
      if (seated === 0) continue;
      const host = this.players.get(room.hostId);
      out.push({
        id: room.id,
        hostNickname: host?.nickname ?? '???',
        seated,
        capacity: room.seats.length,
        inGame: false,
      });
    }
    // Newest first by id sort isn't reliable; just keep insertion order.
    return out;
  }

  /** Returns all socket ids for players in this room (so we can broadcast). */
  socketsInRoom(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const out: string[] = [];
    for (const s of room.seats) {
      if (s.player?.socketId) out.push(s.player.socketId);
    }
    return out;
  }

  getRoom(roomId: string): Room | undefined { return this.rooms.get(roomId); }

  /** Append a log line to the room's persisted history (trimmed to limit). */
  appendLog(roomId: string, line: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.logLines.push(line);
    if (room.logLines.length > HISTORY_LIMIT) {
      room.logLines.splice(0, room.logLines.length - HISTORY_LIMIT);
    }
  }

  /** Append a chat message to the room's persisted history (trimmed to limit). */
  appendChat(roomId: string, line: ChatPayload): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.chatLines.push(line);
    if (room.chatLines.length > HISTORY_LIMIT) {
      room.chatLines.splice(0, room.chatLines.length - HISTORY_LIMIT);
    }
  }

    private generateRoomId(): string {
    // Digits only — easier to type / read out loud.
    // 6 digits gives 900,000 distinct codes (100000-999999), with retry on collision.
    for (let i = 0; i < 20; i++) {
      let s = '';
      for (let k = 0; k < 6; k++) s += Math.floor(Math.random() * 10).toString();
      // Avoid leading zero for cleaner display.
      if (s[0] === '0') s = (1 + Math.floor(Math.random() * 9)).toString() + s.slice(1);
      if (!this.rooms.has(s)) return s;
    }
    // Fallback: extend by another digit until unique.
    let s = nanoid(6).replace(/\D/g, '');
    while (s.length < 6) s += Math.floor(Math.random() * 10).toString();
    return s.slice(0, 6);
  }
}
