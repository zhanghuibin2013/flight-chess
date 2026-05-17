import React, { useMemo, useState } from 'react';
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
  const { nickname, setNickname, createRoom, joinRoom } = useStore();
  const t = useT();
  const [name, setName] = useState(nickname);
  const [avatar, setAvatar] = useState<string>(() => loadStoredAvatar());
  const [roomId, setRoomId] = useState('');

  const initial = useMemo(() => (name.trim() ? name.trim()[0]!.toUpperCase() : ''), [name]);

  const persistAvatar = (a: string) => {
    setAvatar(a);
    try { localStorage.setItem(AVATAR_STORAGE_KEY, a); } catch { /* ignore */ }
  };

  const onCreate = () => {
    if (!name.trim()) return;
    setNickname(name.trim());
    createRoom(name.trim());
  };
  const onJoin = () => {
    if (!name.trim() || !roomId.trim()) return;
    setNickname(name.trim());
    joinRoom(roomId.trim(), name.trim());
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
    </div>
  );
}
