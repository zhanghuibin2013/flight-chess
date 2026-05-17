import React from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';
import type { Color } from '@fkzz/shared';

const SHORT_KEYS: Record<Color, string> = {
  red: 'color.short.red', yellow: 'color.short.yellow', blue: 'color.short.blue', green: 'color.short.green',
};

export default function Hud() {
  const state = useStore(s => s.state)!;
  const room = useStore(s => s.room);
  const mySeat = useStore(s => s.mySeat());
  const t = useT();

  return (
    <div className="hud">
      <h3>{t('hud.players')}</h3>
      {(['red','yellow','blue','green'] as Color[]).map(c => {
        const seat = room?.seats.find(s => s.color === c);
        if (!seat?.player) return null;
        const hand = state.hands[c];
        const isTurn = state.turn === c;
        const isMe = c === mySeat;
        const homed = state.planes[c].filter(p => p.state === 'home').length;
        return (
          <div key={c} className={`hud-player hud-${c} ${isTurn ? 'turn' : ''}`}>
            <div className="hud-name">
              <span className={`dot dot-${c}`} />
              <strong>{t(SHORT_KEYS[c])}</strong> {seat.player.nickname}
              {isMe && <span className="me"> {t('common.you')}</span>}
              {isTurn && <span className="badge">{t('hud.turn')}</span>}
            </div>
            <div className="hud-stats">
              <span title={t('hud.titleRadars')}>📡 {hand.radars}</span>
              <span title={t('hud.titleMissiles')}>🚀 {hand.missiles.length}</span>
              <span title={t('hud.titlePlanesHome')}>🏠 {homed}/4</span>
              {hand.skipRounds > 0 && <span className="skip">{t('hud.skip')}×{hand.skipRounds}</span>}
              {hand.shield && <span className="shield">🛡</span>}
            </div>
          </div>
        );
      })}
      <div className="hud-decks">
        <small>{t('hud.decks', {
          aam: state.deckCounts.aam,
          radar: state.deckCounts.radar,
          reward: state.deckCounts.reward,
          punish: state.deckCounts.punishment,
          qa: state.deckCounts.questions,
        })}</small>
      </div>
    </div>
  );
}
