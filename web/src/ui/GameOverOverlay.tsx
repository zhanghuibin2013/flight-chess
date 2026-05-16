import React from 'react';
import { useStore } from '../state/store';
import type { Color } from '@fkzz/shared';

const COLOR_LABEL: Record<Color, string> = {
  red: 'Red', yellow: 'Yellow', blue: 'Blue', green: 'Green',
};

/**
 * Full-screen overlay shown when state.phase === 'gameOver'.
 * Local seat in state.winners -> victory animation.
 * Otherwise -> defeat animation.
 * Everyone gets Play Again / Exit Room buttons.
 */
export default function GameOverOverlay() {
  const state = useStore(s => s.state);
  const mySeat = useStore(s => s.mySeat()) as Color | null;
  const restartGame = useStore(s => s.restartGame);
  const leaveRoom = useStore(s => s.leaveRoom);

  if (!state || state.phase !== 'gameOver') return null;

  const winners = state.winners ?? [];
  const iWon = !!mySeat && winners.includes(mySeat);
  const winnersText = winners.length === 0 ? 'No winner' : winners.map(c => COLOR_LABEL[c]).join(', ');

  return (
    <div className="gameover-overlay" role="dialog" aria-modal="true">
      <div className={`gameover-card ${iWon ? 'win' : 'lose'}`}>
        {iWon ? (
          <>
            <div className="go-emoji go-emoji-win">🏆</div>
            <div className="go-title go-title-win">Victory!</div>
            <div className="go-subtitle">All your planes are home — well played, {COLOR_LABEL[mySeat!]}.</div>
            <div className="go-confetti">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className={`confetti c${i % 6}`}
                  style={{ left: `${(i * 8) % 100}%`, animationDelay: `${(i % 5) * 0.15}s` }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="go-emoji go-emoji-lose">💥</div>
            <div className="go-title go-title-lose">Defeated</div>
            <div className="go-subtitle">
              {mySeat
                ? <>Winner{winners.length > 1 ? 's' : ''}: <b>{winnersText}</b></>
                : <>Game over. Winner{winners.length > 1 ? 's' : ''}: <b>{winnersText}</b></>}
            </div>
          </>
        )}
        <div className="go-actions">
          <button className="primary big" onClick={restartGame}>Play Again</button>
          <button className="ghost big" onClick={leaveRoom}>Exit Room</button>
        </div>
      </div>
    </div>
  );
}
