import React from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';

type Difficulty = 'easy' | 'medium' | 'hard';
const DIFFICULTY_KEYS: Record<Difficulty, string> = {
  easy:   'room.diff.easy',
  medium: 'room.diff.medium',
  hard:   'room.diff.hard',
};
function difficultyOfNumbers(nums: number[]): Difficulty {
  const key = [...nums].sort().join(',');
  if (key === '2,4,6') return 'easy';
  if (key === '5,6')   return 'medium';
  return 'hard';
}

type VictoryMode = 'oneHome' | 'twoHome' | 'allHome' | 'timed';
const VICTORY_KEYS: Record<VictoryMode, string> = {
  oneHome: 'room.victory.oneHome',
  twoHome: 'room.victory.twoHome',
  allHome: 'room.victory.allHome',
  timed:   'room.victory.timed',
};

/**
 * Compact, collapsible room-info panel rendered in the side rail during a
 * match. Surfaces room ID, host nickname and the game settings that were
 * locked in at start so players can re-check the rules at any time without
 * leaving the board.
 */
export default function RoomInfo() {
  const room = useStore(s => s.room);
  const t = useT();
  if (!room) return null;

  const hostSeat = room.seats.find(s => s.player?.id === room.hostId);
  const hostName = hostSeat?.player?.nickname ?? '—';
  const difficulty = difficultyOfNumbers(room.options.takeoffNumbers);
  const collisionAllEnemies = room.options.collisionAllEnemies ?? true;

  return (
    <details className="room-info">
      <summary>
        <span className="ri-title">{t('roomInfo.title')}</span>
        <span className="ri-code">#{room.id}</span>
      </summary>
      <div className="ri-row">
        <span className="ri-label">{t('lobby.host')}</span>
        <span className="ri-value">{hostName}</span>
      </div>
      <div className="ri-row">
        <span className="ri-label">{t('room.takeoffDifficulty')}</span>
        <span className="ri-value">{t(DIFFICULTY_KEYS[difficulty])}</span>
      </div>
      <div className="ri-row">
        <span className="ri-label">{t('room.victory')}</span>
        <span className="ri-value">{t(VICTORY_KEYS[room.options.victory as VictoryMode])}</span>
      </div>
      <div className="ri-row">
        <span className="ri-label">{t('room.turnTimeout')}</span>
        <span className="ri-value">{t('room.timeoutValue', { s: Math.round(room.options.turnTimeoutMs / 1000) })}</span>
      </div>
      <div className="ri-row">
        <span className="ri-label" title={t('room.collisionAllEnemiesHint')}>{t('room.collisionAllEnemies')}</span>
        <span className="ri-value">{t(collisionAllEnemies ? 'common.on' : 'common.off')}</span>
      </div>
    </details>
  );
}
