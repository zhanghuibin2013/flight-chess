import { io, Socket } from 'socket.io-client';
import { C2S } from '@fkzz/shared';

const PLAYER_ID_KEY = 'fkzz.playerId';
const NICKNAME_KEY  = 'fkzz.nickname';
const AVATAR_KEY    = 'fkzz.avatar';

let socket: Socket | null = null;

export function getStoredPlayerId(): string | null {
  return localStorage.getItem(PLAYER_ID_KEY);
}

export function setStoredPlayerId(id: string | null) {
  if (id) localStorage.setItem(PLAYER_ID_KEY, id);
  else localStorage.removeItem(PLAYER_ID_KEY);
}

export function getSocket(): Socket {
  if (socket) return socket;
  const url = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
  socket = io(url, { autoConnect: true, transports: ['websocket', 'polling'] });

  // Auto-resume session on every (re)connect when we have a stored playerId.
  // This covers: page refresh, server restart (server will reply NO_SESSION
  // and the store will clear localStorage), and transient disconnects.
  socket.on('connect', () => {
    const pid = getStoredPlayerId();
    if (pid) {
      const nickname = localStorage.getItem(NICKNAME_KEY) ?? undefined;
      const avatar = localStorage.getItem(AVATAR_KEY) ?? undefined;
      socket!.emit(C2S.SessionResume, { playerId: pid, nickname, avatar });
    }
  });

  return socket;
}
