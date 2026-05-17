import React from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';
import type { Color } from '@fkzz/shared';

const COLOR_KEYS: Record<Color, string> = {
  red: 'color.red', yellow: 'color.yellow', blue: 'color.blue', green: 'color.green',
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
  const t = useT();

  if (!state || state.phase !== 'gameOver') return null;

  const winners = state.winners ?? [];
  const iWon = !!mySeat && winners.includes(mySeat);
  const winnersText = winners.length === 0
    ? t('go.noWinner')
    : winners.map(c => t(COLOR_KEYS[c])).join(', ');

  return (
    <div className="gameover-overlay" role="dialog" aria-modal="true">
      <div className={`gameover-card ${iWon ? 'win' : 'lose'}`}>
        {iWon ? (
          <>
            <div className="go-emoji go-emoji-win">🏆</div>
            <div className="go-title go-title-win">{t('go.victory')}</div>
            <div className="go-subtitle">{t('go.victorySub', { color: t(COLOR_KEYS[mySeat!]) })}</div>
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
            <div className="go-title go-title-lose">{t('go.defeated')}</div>
            <div className="go-subtitle">
              {mySeat
                ? t(winners.length > 1 ? 'go.winnersMulti' : 'go.winners', { names: winnersText })
                : t('go.gameOverWinners', { names: winnersText })}
            </div>
          </>
        )}
        <div className="go-actions">
          <button className="primary big" onClick={restartGame}>{t('go.playAgain')}</button>
          <button className="ghost big" onClick={leaveRoom}>{t('go.exitRoom')}</button>
        </div>
      </div>
    </div>
  );
}
