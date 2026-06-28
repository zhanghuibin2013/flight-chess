import React from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';
import Board from './Board';
import Hud from './Hud';
import LogPanel from './LogPanel';
import ActionPanel from './ActionPanel';
import RoomInfo from './RoomInfo';
import CombatModal from './CombatModal';
import QAPrompt from './QAPrompt';
import GameOverOverlay from './GameOverOverlay';

export default function Game() {
  const state = useStore(s => s.state);
  const board = useStore(s => s.board);
  const myPrompt = useStore(s => s.myPrompt());
  const qaPrompt = useStore(s => s.qaPrompt());
  const t = useT();

  if (!state || !board) {
    return <div className="loading">{t('game.loading')}</div>;
  }

  // Determine if the current player is the one who should answer the QA.
  const isAnsweringQA = myPrompt?.kind === 'qa';
  // Show the QA to everyone: answering player gets the modal, others get a spectator banner.
  const showQA = qaPrompt?.kind === 'qa' ? qaPrompt : null;

  return (
    <div className="game">
      <div className="game-main">
        <Board />
      </div>
      <aside className="game-side">
        <ActionPanel />
        <RoomInfo />
        <Hud />
        <LogPanel />
      </aside>
      {myPrompt?.kind === 'combat' && <CombatModal prompt={myPrompt} />}
      {isAnsweringQA && <QAPrompt prompt={myPrompt} />}
      {showQA && !isAnsweringQA && <QAPrompt prompt={showQA} readOnly />}
      <GameOverOverlay />
    </div>
  );
}
