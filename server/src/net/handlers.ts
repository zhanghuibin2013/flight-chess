// Socket.IO event handlers — bind every C2S message to engine / room ops.

import type { Server, Socket } from 'socket.io';
import {
  C2S, S2C, LobbyCreateZ, LobbyJoinZ, RoomClaimSeatZ, RoomReadyZ, RoomSetOptsZ,
  TurnRollZ, TurnTakeoffZ, TurnMoveZ, CardPlayZ, CombatRespondZ, QAAnswerZ, ChatSayZ,
  SessionResumeZ,
} from '@fkzz/shared';
import type {
  GameState, RoomPublic, BoardSnapshot,
} from '@fkzz/shared';
import { RoomRegistry, Room } from '../rooms.js';
import type { EngineCallbacks } from '../game/engine.js';
import type { QuestionRow } from '@fkzz/shared';

/** Pseudo-room hosting all sockets that are currently watching the lobby
 *  browser. Anyone in here receives `lobby:list` updates whenever a public
 *  room is created / joined / left / started / destroyed. */
const LOBBY_CHANNEL = '__lobby__';

/** How long remaining players wait for the host to come back before the room
 *  is torn down. Keep in sync with the client-side countdown banner. */
const HOST_ABANDON_MS = 60_000;

export function bindHandlers(io: Server, registry: RoomRegistry, getQuestions: () => QuestionRow[]) {
  // Helper: push a fresh public-room snapshot to every lobby watcher.
  const broadcastLobby = () => {
    io.to(LOBBY_CHANNEL).emit(S2C.LobbyList, { rooms: registry.listPublicRooms() });
  };

  // Track per-room abandon timers so we can cancel on host return.
  const hostAbandonTimers = new Map<string, NodeJS.Timeout>();

  // Disband a room and notify the remaining clients.
  const disbandRoom = (roomId: string) => {
    const t = hostAbandonTimers.get(roomId);
    if (t) { clearTimeout(t); hostAbandonTimers.delete(roomId); }
    const { socketIds } = registry.disbandRoom(roomId);
    // Tell every still-connected member the room is gone, then drop them
    // out of the io room so future broadcasts no longer reach them.
    for (const sid of socketIds) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      s.emit(S2C.RoomState, { room: null });
      s.leave(roomId);
    }
    broadcastLobby();
  };

  // Start (or restart) the host-abandon countdown for a room.
  const startHostAbandonTimer = (roomId: string) => {
    const room = registry.getRoom(roomId);
    if (!room) return;
    // No-op if no other players are even in the room — the room will GC on its own.
    const others = room.seats.filter(s => s.player && s.player.id !== room.hostId);
    if (others.length === 0) return;
    const existing = hostAbandonTimers.get(roomId);
    if (existing) clearTimeout(existing);
    registry.markHostAbandoned(roomId);
    broadcastRoom(io, registry, roomId);
    const t = setTimeout(() => {
      hostAbandonTimers.delete(roomId);
      disbandRoom(roomId);
    }, HOST_ABANDON_MS);
    hostAbandonTimers.set(roomId, t);
  };

  // Cancel the countdown — host has returned.
  const clearHostAbandonTimer = (roomId: string) => {
    const t = hostAbandonTimers.get(roomId);
    if (t) { clearTimeout(t); hostAbandonTimers.delete(roomId); }
    registry.clearHostAbandoned(roomId);
  };

  io.on('connection', (socket: Socket) => {
    socket.emit(S2C.Welcome, { playerId: '' });

    socket.on(C2S.SessionResume, (raw: unknown) => {
      const parsed = SessionResumeZ.safeParse(raw);
      if (!parsed.success) return sendErr(socket, 'BAD_PAYLOAD', parsed.error.message);
      const player = registry.resumeSession(parsed.data.playerId, socket.id, parsed.data.nickname, parsed.data.avatar);
      if (!player) {
        socket.emit(S2C.Welcome, { playerId: '' });
        return sendErr(socket, 'NO_SESSION', 'session expired, please rejoin');
      }
      socket.emit(S2C.Welcome, { playerId: player.id });
      const room = registry.roomOfPlayer(player.id);
      if (!room) { socket.emit(S2C.RoomState, { room: null }); return; }
      socket.join(room.id);
      // Host coming back from a refresh / reconnect cancels the abandon timer.
      if (room.hostId === player.id && room.hostAbandonedAt) {
        clearHostAbandonTimer(room.id);
      }
      broadcastRoom(io, registry, room.id);
      // Replay persisted log + chat so the rejoining client's panel is restored.
      socket.emit(S2C.History, { log: [...room.logLines], chat: [...room.chatLines] });
      if (room.engine) {
        socket.emit(S2C.Board, { board: room.engine.boardSnapshot() });
        socket.emit(S2C.GameState, { state: room.engine.state });
      }
    });

    socket.on(C2S.LobbySubscribe, () => {
      socket.join(LOBBY_CHANNEL);
      socket.emit(S2C.LobbyList, { rooms: registry.listPublicRooms() });
    });
    socket.on(C2S.LobbyUnsubscribe, () => {
      socket.leave(LOBBY_CHANNEL);
    });

    socket.on(C2S.LobbyCreate, (raw: unknown) => {
      const parsed = LobbyCreateZ.safeParse(raw);
      if (!parsed.success) return sendErr(socket, 'BAD_PAYLOAD', parsed.error.message);
      const player = registry.attachSocket(socket.id, parsed.data.nickname, parsed.data.avatar);
      const room = registry.createRoom(player.id, !!parsed.data.isPrivate);
      registry.joinRoom(room.id, player);
      registry.claimSeat(room.id, player, 'red');
      socket.join(room.id);
      // Creator should leave the lobby browser channel — they're now in a room.
      socket.leave(LOBBY_CHANNEL);
      socket.emit(S2C.Welcome, { playerId: player.id });
      broadcastRoom(io, registry, room.id);
      broadcastLobby();
    });

    socket.on(C2S.LobbyJoin, (raw: unknown) => {
      const parsed = LobbyJoinZ.safeParse(raw);
      if (!parsed.success) return sendErr(socket, 'BAD_PAYLOAD', parsed.error.message);
      const { roomId, nickname, avatar } = parsed.data;
      const player = registry.attachSocket(socket.id, nickname, avatar);
      const room = registry.joinRoom(roomId, player);
      if (!room) return sendErr(socket, 'NO_ROOM', `room ${roomId} not found or full`);
      socket.join(room.id);
      socket.leave(LOBBY_CHANNEL);
      // If the original host is rejoining via room code, cancel the disband timer.
      if (room.hostId === player.id && room.hostAbandonedAt) {
        clearHostAbandonTimer(room.id);
      }
      socket.emit(S2C.Welcome, { playerId: player.id });
      broadcastRoom(io, registry, room.id);
      broadcastLobby();
    });

    socket.on(C2S.RoomClaimSeat, (raw: unknown) => {
      const parsed = RoomClaimSeatZ.safeParse(raw);
      if (!parsed.success) return sendErr(socket, 'BAD_PAYLOAD', parsed.error.message);
      const player = registry.playerBySocket(socket.id);
      if (!player) return sendErr(socket, 'NO_PLAYER', '');
      const room = registry.roomOfPlayer(player.id);
      if (!room) return sendErr(socket, 'NO_ROOM', '');
      registry.claimSeat(room.id, player, parsed.data.color);
      broadcastRoom(io, registry, room.id);
    });

    socket.on(C2S.RoomReady, (raw: unknown) => {
      const parsed = RoomReadyZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id);
      if (!player) return;
      const room = registry.roomOfPlayer(player.id);
      if (!room) return;
      registry.setReady(room.id, player.id, parsed.data.ready);
      broadcastRoom(io, registry, room.id);
    });

    socket.on(C2S.RoomSetOpts, (raw: unknown) => {
      const parsed = RoomSetOptsZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id);
      if (!player) return;
      const room = registry.roomOfPlayer(player.id);
      if (!room) return;
      registry.setOptions(room.id, player.id, parsed.data);
      broadcastRoom(io, registry, room.id);
    });

    socket.on(C2S.RoomStart, () => {
      const player = registry.playerBySocket(socket.id);
      if (!player) return;
      const room = registry.roomOfPlayer(player.id);
      if (!room) return;
      const cb = makeCallbacks(io, registry, room.id);
      const ok = registry.startGame(room.id, player.id, getQuestions(), cb);
      if (!ok) return sendErr(socket, 'CANT_START', 'need 2+ players, all ready');
      const board: BoardSnapshot = room.engine!.boardSnapshot();
      io.to(room.id).emit(S2C.Board, { board });
      broadcastRoom(io, registry, room.id);
      cb.onState(room.engine!.state);
      // Game now in progress — drop this room from the public lobby list.
      broadcastLobby();
    });

    socket.on(C2S.RoomRestart, () => {
      const player = registry.playerBySocket(socket.id);
      if (!player) return;
      const room = registry.roomOfPlayer(player.id);
      if (!room) return;
      const cb = makeCallbacks(io, registry, room.id);
      const ok = registry.restartGame(room.id, player.id, getQuestions(), cb);
      if (!ok) return sendErr(socket, 'CANT_RESTART', 'game not over or not seated');
      const board: BoardSnapshot = room.engine!.boardSnapshot();
      io.to(room.id).emit(S2C.Board, { board });
      broadcastRoom(io, registry, room.id);
      cb.onState(room.engine!.state);
    });

    socket.on(C2S.TurnRoll, (raw: unknown) => withGame(registry, socket, (room) => {
      const player = registry.playerBySocket(socket.id)!;
      const seat = seatOfPlayer(room, player.id);
      if (!seat) return;
      room.engine!.rollDice(seat);
    }));

    socket.on(C2S.TurnTakeoff, (raw: unknown) => withGame(registry, socket, (room) => {
      const parsed = TurnTakeoffZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id)!;
      const seat = seatOfPlayer(room, player.id);
      if (!seat) return;
      room.engine!.chooseTakeoff(seat, parsed.data.planeIndex);
    }));

    socket.on(C2S.TurnMove, (raw: unknown) => withGame(registry, socket, (room) => {
      const parsed = TurnMoveZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id)!;
      const seat = seatOfPlayer(room, player.id);
      if (!seat) return;
      room.engine!.chooseMovePlane(seat, parsed.data.planeIndex);
    }));

    socket.on(C2S.CardPlay, (raw: unknown) => withGame(registry, socket, (room) => {
      const parsed = CardPlayZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id)!;
      const seat = seatOfPlayer(room, player.id);
      if (!seat) return;
      const d = parsed.data;
      room.engine!.playCard(seat, d.cardId, d.targetColor, d.targetPlaneIndex, d.targetRadarIndex);
    }));

    socket.on(C2S.CombatRespond, (raw: unknown) => withGame(registry, socket, (room) => {
      const parsed = CombatRespondZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id)!;
      const seat = seatOfPlayer(room, player.id);
      if (!seat) return;
      room.engine!.combatRespond(seat, parsed.data.combatId, parsed.data.choice, parsed.data.data);
    }));

    socket.on(C2S.QAAnswer, (raw: unknown) => withGame(registry, socket, (room) => {
      const parsed = QAAnswerZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id)!;
      const seat = seatOfPlayer(room, player.id);
      if (!seat) return;
      room.engine!.qaAnswer(seat, parsed.data.questionId, parsed.data.answerIndex);
    }));

    socket.on(C2S.ChatSay, (raw: unknown) => {
      const parsed = ChatSayZ.safeParse(raw);
      if (!parsed.success) return;
      const player = registry.playerBySocket(socket.id);
      if (!player) return;
      const room = registry.roomOfPlayer(player.id);
      if (!room) return;
      const line = {
        from: player.id, nickname: player.nickname, message: parsed.data.message, ts: Date.now(),
      };
      registry.appendChat(room.id, line);
      io.to(room.id).emit(S2C.Chat, line);
    });

    socket.on(C2S.RoomLeave, () => {
      const player = registry.playerBySocket(socket.id);
      if (!player) return;
      const room = registry.roomOfPlayer(player.id);
      if (!room) return;
      const wasHost = room.hostId === player.id;
      const roomId = room.id;
      registry.leaveRoom(player.id);
      socket.leave(roomId);
      // Host explicitly leaving — kick off the disband countdown for the remaining players.
      if (wasHost && registry.getRoom(roomId)) {
        startHostAbandonTimer(roomId);
      }
      broadcastRoom(io, registry, roomId);
      broadcastLobby();
    });

    socket.on('disconnect', () => {
      const player = registry.playerBySocket(socket.id);
      const room = player ? registry.roomOfPlayer(player.id) : undefined;
      const wasHost = !!(room && player && room.hostId === player.id);
      const roomId = room?.id;
      registry.detachSocket(socket.id);
      if (roomId) {
        // Host's socket dropped — start the abandon countdown immediately.
        // (If the host reconnects via SessionResume within 60s, the timer is cleared.)
        if (wasHost && !registry.isHostPresent(roomId)) {
          startHostAbandonTimer(roomId);
        }
        broadcastRoom(io, registry, roomId);
      }
      // A disconnect can change seat-counts in lobby-listed rooms.
      broadcastLobby();
    });
  });
}

function seatOfPlayer(room: Room, playerId: string) {
  const s = room.seats.find(x => x.player?.id === playerId);
  return s?.color;
}

function withGame(registry: RoomRegistry, socket: Socket, fn: (room: Room, raw: unknown) => void) {
  const player = registry.playerBySocket(socket.id);
  if (!player) return;
  const room = registry.roomOfPlayer(player.id);
  if (!room || !room.engine) return;
  fn(room, undefined);
}

function broadcastRoom(io: Server, registry: RoomRegistry, roomId: string) {
  const room = registry.getRoom(roomId);
  if (!room) return;
  const pub: RoomPublic = registry.publicRoom(room);
  io.to(roomId).emit(S2C.RoomState, { room: pub });
}

function makeCallbacks(io: Server, registry: RoomRegistry, roomId: string): EngineCallbacks {
  // Persist + broadcast a log line so it survives reconnects.
  const pushLog = (line: string) => {
    registry.appendLog(roomId, line);
    io.to(roomId).emit(S2C.EventLog, { line });
  };
  return {
    onState(state: GameState) {
      io.to(roomId).emit(S2C.GameState, { state });
    },
    onEvent(ev) {
      if (ev.kind === 'dice') io.to(roomId).emit(S2C.EventDice, ev);
      else if (ev.kind === 'cardDrawn') {
        const room = registry.getRoom(roomId);
        if (!room) return;
        const seat = room.seats.find(s => s.color === ev.seat);
        if (seat?.player?.socketId) {
          io.to(seat.player.socketId).emit(S2C.EventCard, {
            seat: ev.seat, cardType: ev.card.type, cardKind: (ev.card as any).kind,
          });
        }
        pushLog('i18n:' + JSON.stringify({ k: 'log.drewCard', p: { color: ev.seat } }));
      } else if (ev.kind === 'log') {
        pushLog(ev.line);
      }
    },
    onGameOver(winners) {
      pushLog('i18n:' + JSON.stringify({ k: 'log.gameOver', p: { list: winners.join(', ') } }));
    },
  };
}

function sendErr(socket: Socket, code: string, message: string) {
  socket.emit(S2C.Error, { code, message });
}
