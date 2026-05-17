import React from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';
import type { Color } from '@fkzz/shared';

const COLOR_KEYS: Record<Color, string> = {
  red: 'color.red', yellow: 'color.yellow', blue: 'color.blue', green: 'color.green',
};
const COLOR_SHORT_KEYS: Record<Color, string> = {
  red: 'color.short.red', yellow: 'color.short.yellow', blue: 'color.short.blue', green: 'color.short.green',
};

// Visual seat order in the 2x2 grid (filled row-by-row left→right, top→bottom)
// must mirror the board's clockwise spatial layout:
//   yellow(TL) — blue(TR)
//      red(BL) — green(BR)
// See server/src/game/board.ts (COLOR_ROT comment) for the canonical layout.
const SEAT_DISPLAY_ORDER: Color[] = ['yellow', 'blue', 'red', 'green'];

type Difficulty = 'easy' | 'medium' | 'hard';
const DIFFICULTY_PRESETS: Record<Difficulty, number[]> = {
  easy: [2, 4, 6],
  medium: [5, 6],
  hard: [6],
};
const DIFFICULTY_KEYS: Record<Difficulty, string> = {
  easy: 'room.diff.easy',
  medium: 'room.diff.medium',
  hard: 'room.diff.hard',
};
function difficultyOfNumbers(nums: number[]): Difficulty {
  const key = [...nums].sort().join(',');
  if (key === '2,4,6') return 'easy';
  if (key === '5,6') return 'medium';
  return 'hard';
}

type VictoryMode = 'oneHome' | 'twoHome' | 'allHome' | 'timed';
const VICTORY_KEYS: Record<VictoryMode, string> = {
  oneHome: 'room.victory.oneHome',
  twoHome: 'room.victory.twoHome',
  allHome: 'room.victory.allHome',
  timed:   'room.victory.timed',
};

export default function Room() {
  const { room, playerId, claimSeat, setReady, setOptions, startGame, leaveRoom } = useStore();
  const t = useT();
  if (!room) return <div>{t('room.loading')}</div>;

  const me = room.seats.find(s => s.player?.id === playerId);
  const isHost = room.hostId === playerId;
  const seated = room.seats.filter(s => s.player);
  const canStart = isHost && seated.length >= 2 && seated.every(s => s.ready || s.player?.id === room.hostId);
  const currentDifficulty = difficultyOfNumbers(room.options.takeoffNumbers);

  const onDifficultyChange = (d: Difficulty) => {
    setOptions({ ...room.options, takeoffNumbers: DIFFICULTY_PRESETS[d] });
  };
  const onVictoryChange = (v: VictoryMode) => {
    setOptions({ ...room.options, victory: v });
  };
  const onCollisionAllEnemiesChange = (v: boolean) => {
    setOptions({ ...room.options, collisionAllEnemies: v });
  };

  // Backward-compat: rooms created before this option was added may have
  // these fields undefined; treat undefined as the strict rulebook default.
  const collisionAllEnemies = room.options.collisionAllEnemies ?? false;

  return (
    <div className="room">
      <header>
        <h2>{t('room.title')} <span className="code">{room.id}</span></h2>
        <button className="ghost" onClick={leaveRoom}>{t('common.leave')}</button>
      </header>

      <div className="seats">
        {SEAT_DISPLAY_ORDER.map(color => {
          const s = room.seats.find(x => x.color === color);
          if (!s) return null;
          return (
            <button
              key={s.color}
              className={`seat seat-${s.color} ${s.player ? 'taken' : ''} ${me?.color === s.color ? 'mine' : ''}`}
              onClick={() => claimSeat(s.color)}
            >
              <div className="seat-color">{t(COLOR_SHORT_KEYS[s.color])} {t(COLOR_KEYS[s.color])}</div>
              <div className="seat-player">
                {s.player ? `${s.player.nickname}${s.ready ? ' ✓' : ''}${!s.player.connected ? ' ' + t('room.offline') : ''}` : t('common.empty')}
              </div>
            </button>
          );
        })}
      </div>

      <div className="options">
        <h3>{t('room.options')} {isHost ? '' : <small>{t('room.hostOnly')}</small>}</h3>
        <div className="option-row">
          <label className="option-label">{t('room.takeoffDifficulty')}</label>
          {isHost ? (
            <select className="option-input" value={currentDifficulty} onChange={e => onDifficultyChange(e.target.value as Difficulty)}>
              {(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map(d => (
                <option key={d} value={d}>{t(DIFFICULTY_KEYS[d])}</option>
              ))}
            </select>
          ) : (
            <span className="option-value">{t(DIFFICULTY_KEYS[currentDifficulty])}</span>
          )}
        </div>
        <div className="option-row">
          <label className="option-label">{t('room.turnTimeout')}</label>
          <span className="option-value">{t('room.timeoutValue', { s: Math.round(room.options.turnTimeoutMs / 1000) })}</span>
        </div>
        <div className="option-row">
          <label className="option-label">{t('room.victory')}</label>
          {isHost ? (
            <select
              className="option-input"
              value={room.options.victory}
              onChange={e => onVictoryChange(e.target.value as VictoryMode)}
            >
              {(Object.keys(VICTORY_KEYS) as VictoryMode[]).map(v => (
                <option key={v} value={v}>{t(VICTORY_KEYS[v])}</option>
              ))}
            </select>
          ) : (
            <span className="option-value">{t(VICTORY_KEYS[room.options.victory as VictoryMode])}</span>
          )}
        </div>
        <div className="option-row">
          <label className="option-label" title={t('room.collisionAllEnemiesHint')}>{t('room.collisionAllEnemies')}</label>
          {isHost ? (
            <input
              type="checkbox"
              className="option-input"
              checked={collisionAllEnemies}
              onChange={e => onCollisionAllEnemiesChange(e.target.checked)}
            />
          ) : (
            <span className="option-value">{t(collisionAllEnemies ? 'common.on' : 'common.off')}</span>
          )}
        </div>
      </div>

      <div className="actions">
        {me && (
          <button onClick={() => setReady(!me.ready)}>
            {me.ready ? t('room.unready') : t('room.ready')}
          </button>
        )}
        {isHost && (
          <button className="primary" disabled={!canStart} onClick={startGame}>
            {t('room.start')}
          </button>
        )}
      </div>
    </div>
  );
}
