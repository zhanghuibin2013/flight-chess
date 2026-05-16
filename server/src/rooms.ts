// In-memory room registry: lobby + game lifecycle.

import { nanoid } from 'nanoid';
import type {
  Color, GameOptions, PlayerPublic, RoomPublic, QuestionRow,
} from '@fkzz/shared';
import { COLORS } from '@fkzz/shared';
import { GameEngine, EngineCallbacks } from './game/engine.js';

export interface Player {
  id: string;          // stable player id (cookie-style)
  socketId?: string;   // current socket
  nickname: string;
  connected: boolean;
  isBot: boolean;
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
}

const DEFAULT_OPTIONS: GameOptions = {
  takeoffNumbers: [6],
  turnTimeoutMs: 60_000,
  victory: 'twoHome',
  fillBots: false,
};

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private players = new Map<string, Player>();
  private socketToPlayer = new Map<string, string>(); // socketId -> playerId
  private playerToRoom = new Map<string, string>();

  /** Resolve a player by socket. Creates an anonymous record if none. */
  attachSocket(socketId: string, nickname: string): Player {
    const existingPid = this.socketToPlayer.get(socketId);
    const existing = existingPid ? this.players.get(existingPid) : undefined;
    const player: Player = existing ?? {
      id: nanoid(10), socketId, nickname, connected: true, isBot: false,
    };
    if (!existing) this.players.set(player.id, player);
    player.socketId = socketId;
    player.connected = true;
    if (nickname) player.nickname = nickname;
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
  resumeSession(playerId: string, socketId: string, nickname?: string): Player | null {
    const player = this.players.get(playerId);
    if (!player) return null;
    // Detach previous socket binding if any.
    if (player.socketId && player.socketId !== socketId) {
      this.socketToPlayer.delete(player.socketId);
    }
    player.socketId = socketId;
    player.connected = true;
    if (nickname) player.nickname = nickname;
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

  createRoom(hostPlayerId: string): Room {
    const id = this.generateRoomId();
    const room: Room = {
      id,
      hostId: hostPlayerId,
      seats: COLORS.map(c => ({ color: c, ready: false })),
      options: { ...DEFAULT_OPTIONS },
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

  setReady(roomId: string, playerId: string, ready: boolean): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const seat = room.seats.find(s => s.player?.id === playerId);
    if (!seat) return false;
    seat.ready = ready;
    return true;
  }

  setOptions(roomId: string, hostPlayerId: string, options: GameOptions): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostPlayerId) return false;
    room.options = options;
    return true;
  }

  startGame(roomId: string, hostPlayerId: string, questions: QuestionRow[], cb: EngineCallbacks): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostPlayerId) return false;
    const seated = room.seats.filter(s => s.player);
    if (seated.length < 2) return false;
    if (!seated.every(s => s.ready || s.player?.id === room.hostId)) return false;

    const seats = seated.map(s => s.color);
    room.engine = new GameEngine(room.options, seats, questions, cb);
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
    // GC empty rooms (no engine running).
    if (!room.engine && room.seats.every(s => !s.player)) {
      this.rooms.delete(rid);
    }
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
    };
  }
  private publicPlayer(p: Player): PlayerPublic {
    return { id: p.id, nickname: p.nickname, color: 'red' /*overwritten by seat*/, connected: p.connected, isBot: p.isBot };
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

  private generateRoomId(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 10; i++) {
      let s = '';
      for (let k = 0; k < 6; k++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      if (!this.rooms.has(s)) return s;
    }
    return nanoid(6).toUpperCase();
  }
}
