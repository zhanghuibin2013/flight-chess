import React from 'react';
import { useStore } from '../state/store';
import type { Color } from '@fkzz/shared';

const LABEL: Record<Color, string> = { red: '红', yellow: '黄', blue: '蓝', green: '绿' };

export default function Hud() {
  const state = useStore(s => s.state)!;
  const room = useStore(s => s.room);
  const mySeat = useStore(s => s.mySeat());

  return (
    <div className="hud">
      <h3>Players</h3>
      {(['red','yellow','blue','green'] as Color[]).map(c => {
        const seat = room?.seats.find(s => s.color === c);
        if (!seat?.player) return null;
        const hand = state.hands[c];
        const isTurn = state.turn === c;
        return (
          <div key={c} className={`hud-player hud-${c} ${isTurn ? 'turn' : ''}`}>
            <div className="hud-name">
              <span className={`dot dot-${c}`} />
              <strong>{LABEL[c]}</strong> {seat.player.nickname}
              {c === mySeat && <span className="me"> (you)</span>}
              {isTurn && <span className="badge">turn</span>}
            </div>
            <div className="hud-stats">
              <span>📡 {hand.radars}</span>
              <span>🛩 {hand.missiles.length}</span>
              <span>🏠 {state.planes[c].filter(p => p.state === 'home').length}/4</span>
              {hand.skipRounds > 0 && <span className="skip">skip×{hand.skipRounds}</span>}
              {hand.shield && <span className="shield">🛡</span>}
            </div>
          </div>
        );
      })}
      <div className="hud-decks">
        <small>Decks — missiles: {state.deckCounts.aam} · radar: {state.deckCounts.radar} · reward: {state.deckCounts.reward} · punish: {state.deckCounts.punishment} · QA: {state.deckCounts.questions}</small>
      </div>
    </div>
  );
}
