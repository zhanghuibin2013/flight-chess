import React from 'react';
import { useStore } from './state/store';
import Lobby from './ui/Lobby';
import Room from './ui/Room';
import Game from './ui/Game';

export default function App() {
  const screen = useStore(s => s.screen);
  const lastError = useStore(s => s.lastError);
  return (
    <div className="app">
      {screen === 'lobby' && <Lobby />}
      {screen === 'room' && <Room />}
      {screen === 'game' && <Game />}
      {lastError && <div className="toast-error">{lastError}</div>}
    </div>
  );
}
