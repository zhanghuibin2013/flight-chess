import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';

// Pre-canned avatar emojis the user can pick from. Lightweight, no asset deps.
const AVATAR_OPTIONS = ['✈️', '🚀', '🛩️', '🛫', '🪂', '🦅', '🛸', '⭐', '🎯', '🎖️'];
const AVATAR_STORAGE_KEY = 'fkzz.avatar';

function loadStoredAvatar(): string {
  try {
    const v = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (v && AVATAR_OPTIONS.includes(v)) return v;
  } catch { /* ignore */ }
  return AVATAR_OPTIONS[0]!;
}

export default function Lobby() {
  const {
    nickname, setNickname, createRoom, joinRoom,
    publicRooms, subscribeLobby, unsubscribeLobby,
  } = useStore();
  const t = useT();
  const [name, setName] = useState(nickname);
  const [avatar, setAvatar] = useState<string>(() => loadStoredAvatar());
  const [roomId, setRoomId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const initial = useMemo(() => (name.trim() ? name.trim()[0]!.toUpperCase() : ''), [name]);

  // Subscribe to the public-room browser as long as we're on the lobby screen.
  useEffect(() => {
    subscribeLobby();
    return () => { unsubscribeLobby(); };
  }, [subscribeLobby, unsubscribeLobby]);

  const persistAvatar = (a: string) => {
    setAvatar(a);
    try { localStorage.setItem(AVATAR_STORAGE_KEY, a); } catch { /* ignore */ }
  };

  const onCreate = () => {
    if (!name.trim()) return;
    setNickname(name.trim());
    createRoom(name.trim(), isPrivate, avatar);
  };
  const onJoin = () => {
    if (!name.trim() || !roomId.trim()) return;
    setNickname(name.trim());
    joinRoom(roomId.trim(), name.trim(), avatar);
  };
  const onJoinPublic = (rid: string) => {
    if (!name.trim()) return;
    setNickname(name.trim());
    joinRoom(rid, name.trim(), avatar);
  };

  return (
    <div className="lobby">
      <h1>{t('lobby.title')}</h1>
      <p className="subtitle">{t('lobby.subtitle')}</p>
      <div className="lobby-grid">
        {/* Left column: player info */}
        <div className="card lobby-player">
          <div className="card-title">{t('lobby.playerInfo')}</div>
          <div className="avatar-preview">
            <div className="avatar-large">
              <span className="avatar-emoji">{avatar}</span>
              {initial && <span className="avatar-initial">{initial}</span>}
            </div>
            <div className="avatar-name">{name.trim() || t('lobby.pilotPlaceholder')}</div>
          </div>
          <label>
            {t('lobby.nickname')}
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={16}
              placeholder={t('lobby.pilotPlaceholder')}
            />
          </label>
          <div className="avatar-picker-label">{t('lobby.avatar')}</div>
          <div className="avatar-picker">
            {AVATAR_OPTIONS.map(a => (
              <button
                key={a}
                type="button"
                className={'avatar-option' + (a === avatar ? ' active' : '')}
                onClick={() => persistAvatar(a)}
                aria-label={a}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Right column: two modes */}
        <div className="lobby-modes">
          <div className="card lobby-mode">
            <div className="card-title">{t('lobby.create')}</div>
            <p className="mode-desc">{t('lobby.createDesc')}</p>
            <label className="lobby-private-row">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={e => setIsPrivate(e.target.checked)}
              />
              <span>{t('lobby.private')}</span>
            </label>
            <p className="lobby-private-hint">{t('lobby.privateHint')}</p>
            <button className="primary" onClick={onCreate} disabled={!name.trim()}>
              {t('lobby.create')}
            </button>
          </div>
          <div className="card lobby-mode">
            <div className="card-title">{t('lobby.join')}</div>
            <p className="mode-desc">{t('lobby.joinDesc')}</p>
            <label>
              {t('lobby.roomCode')}
              <input
                value={roomId}
                onChange={e => setRoomId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                placeholder={t('lobby.codePlaceholder')}
              />
            </label>
            <button onClick={onJoin} disabled={!name.trim() || !roomId.trim()}>
              {t('lobby.join')}
            </button>
          </div>
        </div>
      </div>

      {/* Public rooms browser — full-width below the two-column area. */}
      <div className="card lobby-public">
        <div className="lobby-public-head">
          <span className="card-title">{t('lobby.publicRooms')}</span>
          <button className="lobby-refresh" onClick={subscribeLobby} aria-label={t('lobby.refresh')}>
            ⟳ {t('lobby.refresh')}
          </button>
        </div>
        {publicRooms.length === 0 ? (
          <p className="lobby-public-empty">{t('lobby.publicRoomsEmpty')}</p>
        ) : (
          <ul className="lobby-public-list">
            {publicRooms.map(r => (
              <li key={r.id} className="lobby-public-item">
                <div className="lobby-public-meta">
                  <span className="lobby-public-id">#{r.id}</span>
                  <span className="lobby-public-host">{t('lobby.host')}: {r.hostNickname}</span>
                  <span className="lobby-public-count">{t('lobby.seats')}: {r.seated}/{r.capacity}</span>
                </div>
                <button
                  className="primary"
                  onClick={() => onJoinPublic(r.id)}
                  disabled={!name.trim() || r.seated >= r.capacity}
                >
                  {t('lobby.publicJoinBtn')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
