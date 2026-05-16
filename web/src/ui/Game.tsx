import React from 'react';
import { useStore } from '../state/store';
import Board from './Board';
import Hud from './Hud';
import LogPanel from './LogPanel';
import ActionPanel from './ActionPanel';
import CombatModal from './CombatModal';
import QAPrompt from './QAPrompt';

export default function Game() {
  const state = useStore(s => s.state);
  const board = useStore(s => s.board);
  const myPrompt = useStore(s => s.myPrompt());

  if (!state || !board) {
    return <div className="loading">Loading game…</div>;
  }

  return (
    <div className="game">
      <div className="game-main">
        <Board />
      </div>
      <aside className="game-side">
        <ActionPanel />
        <Hud />
        <LogPanel />
      </aside>
      {myPrompt?.kind === 'combat' && <CombatModal prompt={myPrompt} />}
      {myPrompt?.kind === 'qa' && <QAPrompt prompt={myPrompt} />}
    </div>
  );
}
