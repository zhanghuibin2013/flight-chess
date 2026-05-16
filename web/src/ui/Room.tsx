import React from 'react';
import { useStore } from '../state/store';
import type { Color } from '@fkzz/shared';

const COLOR_LABELS: Record<Color, string> = {
  red: '红 Red', yellow: '黄 Yellow', blue: '蓝 Blue', green: '绿 Green',
};

type Difficulty = 'easy' | 'medium' | 'hard';
const DIFFICULTY_PRESETS: Record<Difficulty, number[]> = {
  easy: [2, 4, 6],
  medium: [5, 6],
  hard: [6],
};
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy (takeoff on 2 / 4 / 6)',
  medium: 'Medium (takeoff on 5 / 6)',
  hard: 'Hard (takeoff on 6 only)',
};
function difficultyOfNumbers(nums: number[]): Difficulty {
  const key = [...nums].sort().join(',');
  if (key === '2,4,6') return 'easy';
  if (key === '5,6') return 'medium';
  return 'hard';
}

type VictoryMode = 'twoHome' | 'allHome' | 'timed';
const VICTORY_LABELS: Record<VictoryMode, string> = {
  twoHome: 'First to land 2 planes home',
  allHome: 'First to land ALL 4 planes home',
  timed:   'Timed — most planes home when time is up',
};

export default function Room() {
  const { room, playerId, claimSeat, setReady, setOptions, startGame, leaveRoom } = useStore();
  if (!room) return <div>Loading…</div>;

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

  return (
    <div className="room">
      <header>
        <h2>Room <span className="code">{room.id}</span></h2>
        <button className="ghost" onClick={leaveRoom}>Leave</button>
      </header>

      <div className="seats">
        {room.seats.map(s => (
          <button
            key={s.color}
            className={`seat seat-${s.color} ${s.player ? 'taken' : ''} ${me?.color === s.color ? 'mine' : ''}`}
            onClick={() => claimSeat(s.color)}
          >
            <div className="seat-color">{COLOR_LABELS[s.color]}</div>
            <div className="seat-player">
              {s.player ? `${s.player.nickname}${s.ready ? ' ✓' : ''}${!s.player.connected ? ' (offline)' : ''}` : '— empty —'}
            </div>
          </button>
        ))}
      </div>

      <div className="options">
        <h3>Game Options {isHost ? '' : <small>(host only)</small>}</h3>
        <div className="option-row">
          <label className="option-label">Takeoff Difficulty</label>
          {isHost ? (
            <select className="option-input" value={currentDifficulty} onChange={e => onDifficultyChange(e.target.value as Difficulty)}>
              {(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map(d => (
                <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
              ))}
            </select>
          ) : (
            <span className="option-value">{DIFFICULTY_LABELS[currentDifficulty]}</span>
          )}
        </div>
        <div className="option-row">
          <label className="option-label">Turn timeout</label>
          <span className="option-value">{Math.round(room.options.turnTimeoutMs / 1000)}s</span>
        </div>
        <div className="option-row">
          <label className="option-label">Victory condition</label>
          {isHost ? (
            <select
              className="option-input"
              value={room.options.victory}
              onChange={e => onVictoryChange(e.target.value as VictoryMode)}
            >
              {(Object.keys(VICTORY_LABELS) as VictoryMode[]).map(v => (
                <option key={v} value={v}>{VICTORY_LABELS[v]}</option>
              ))}
            </select>
          ) : (
            <span className="option-value">{VICTORY_LABELS[room.options.victory as VictoryMode]}</span>
          )}
        </div>
      </div>

      <div className="actions">
        {me && (
          <button onClick={() => setReady(!me.ready)}>
            {me.ready ? 'Unready' : 'Ready'}
          </button>
        )}
        {isHost && (
          <button className="primary" disabled={!canStart} onClick={startGame}>
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}
