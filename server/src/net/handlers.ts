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

export function bindHandlers(io: Server, registry: RoomRegistry, getQuestions: () => QuestionRow[]) {
  io.on('connection', (socket: Socket) => {
    socket.emit(S2C.Welcome, { playerId: '' }); // filled after first lobby action

    socket.on(C2S.SessionResume, (raw: unknown) => {
      const parsed = SessionResumeZ.safeParse(raw);
      if (!parsed.success) return sendErr(socket, 'BAD_PAYLOAD', parsed.error.message);
      const player = registry.resumeSession(parsed.data.playerId, socket.id, parsed.data.nickname);
      if (!player) {
        // Unknown player id (server restarted, or expired). Tell client so it
        // can clear its stored id and fall back to the lobby flow.
        socket.emit(S2C.Welcome, { playerId: '' });
        return sendErr(socket, 'NO_SESSION', 'session expired, please rejoin');
      }
      socket.emit(S2C.Welcome, { playerId: player.id });
      const room = registry.roomOfPlayer(player.id);
      if (!room) {
        socket.emit(S2C.RoomState, { room: null });
        return;
      }
      socket.join(room.id);
      // Re-broadcast room (so others see this player as connected again),
      // and push a snapshot directly to this socket so the UI hydrates.
      broadcastRoom(io, registry, room.id);
      if (room.engine) {
        socket.emit(S2C.Board, { board: room.engine.boardSnapshot() });
        socket.emit(S2C.GameState, { state: room.engine.state });
      }
    });

    socket.on(C2S.LobbyCreate, (raw: unknown) => {
      const parsed = LobbyCreateZ.safeParse(raw);
      if (!parsed.success) return sendErr(socket, 'BAD_PAYLOAD', parsed.error.message);
      const player = registry.attachSocket(socket.id, parsed.data.nickname);
      const room = registry.createRoom(player.id);
      registry.joinRoom(room.id, player);
      registry.claimSeat(room.id, player, 'red');
      socket.join(room.id);
      socket.emit(S2C.Welcome, { playerId: player.id });
      broadcastRoom(io, registry, room.id);
    });

    socket.on(C2S.LobbyJoin, (raw: unknown) => {
      const parsed = LobbyJoinZ.safeParse(raw);
      if (!parsed.success) return sendErr(socket, 'BAD_PAYLOAD', parsed.error.message);
      const { roomId, nickname } = parsed.data;
      const player = registry.attachSocket(socket.id, nickname);
      const room = registry.joinRoom(roomId, player);
      if (!room) return sendErr(socket, 'NO_ROOM', `room ${roomId} not found or full`);
      socket.join(room.id);
      socket.emit(S2C.Welcome, { playerId: player.id });
      broadcastRoom(io, registry, room.id);
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
      // Push board snapshot once.
      const board: BoardSnapshot = room.engine!.boardSnapshot();
      io.to(room.id).emit(S2C.Board, { board });
      broadcastRoom(io, registry, room.id);
      cb.onState(room.engine!.state);
    });

    socket.on(C2S.TurnRoll, (raw: unknown) => withGame(registry, socket, (room, _) => {
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
      io.to(room.id).emit(S2C.Chat, {
        from: player.id, nickname: player.nickname, message: parsed.data.message, ts: Date.now(),
      });
    });

    socket.on(C2S.RoomLeave, () => {
      const player = registry.playerBySocket(socket.id);
      if (!player) return;
      const room = registry.roomOfPlayer(player.id);
      if (!room) return;
      registry.leaveRoom(player.id);
      socket.leave(room.id);
      broadcastRoom(io, registry, room.id);
    });

    socket.on('disconnect', () => {
      registry.detachSocket(socket.id);
      // Keep player record so they can reconnect; broadcast room state for connection indicator.
      const player = registry.playerBySocket(socket.id);
      if (player) {
        const room = registry.roomOfPlayer(player.id);
        if (room) broadcastRoom(io, registry, room.id);
      }
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
  return {
    onState(state: GameState) {
      io.to(roomId).emit(S2C.GameState, { state });
    },
    onEvent(ev) {
      if (ev.kind === 'dice') io.to(roomId).emit(S2C.EventDice, ev);
      else if (ev.kind === 'cardDrawn') {
        // Only deliver concrete card details to the seat that drew it.
        const room = registry.getRoom(roomId);
        if (!room) return;
        const seat = room.seats.find(s => s.color === ev.seat);
        if (seat?.player?.socketId) {
          io.to(seat.player.socketId).emit(S2C.EventCard, {
            seat: ev.seat, cardType: ev.card.type, cardKind: (ev.card as any).kind,
          });
        }
        // Everyone gets a generic notice
        io.to(roomId).emit(S2C.EventLog, { line: `${ev.seat} drew a card` });
      } else if (ev.kind === 'log') {
        io.to(roomId).emit(S2C.EventLog, { line: ev.line });
      }
    },
    onGameOver(winners) {
      io.to(roomId).emit(S2C.EventLog, { line: `Game over — winners: ${winners.join(', ')}` });
    },
  };
}

function sendErr(socket: Socket, code: string, message: string) {
  socket.emit(S2C.Error, { code, message });
}
