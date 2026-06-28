import React, { useEffect, useState } from 'react';
import { useStore } from './state/store';
import Lobby from './ui/Lobby';
import Room from './ui/Room';
import Game from './ui/Game';
import LanguageSwitch from './ui/LanguageSwitch';
import HostAbandonBanner from './ui/HostAbandonBanner';
import QuestionBankAdmin from './ui/QuestionBankAdmin';
import PracticeMode from './ui/PracticeMode';

/** Returns the current route category based on the URL hash. */
function useRoute(): 'game' | 'admin' | 'practice' {
  const [route, setRoute] = useState<'game' | 'admin' | 'practice'>(() => {
    const h = typeof window !== 'undefined' ? window.location.hash : '';
    if (h.startsWith('#admin')) return 'admin';
    if (h.startsWith('#practice')) return 'practice';
    return 'game';
  });
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash;
      if (h.startsWith('#admin')) setRoute('admin');
      else if (h.startsWith('#practice')) setRoute('practice');
      else setRoute('game');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export default function App() {
  const screen = useStore(s => s.screen);
  const lastError = useStore(s => s.lastError);
  const route = useRoute();

  if (route === 'admin') {
    return (
      <div className="app">
        <LanguageSwitch />
        <QuestionBankAdmin />
        {lastError && <div className="toast-error">{lastError}</div>}
      </div>
    );
  }

  if (route === 'practice') {
    return (
      <div className="app">
        <LanguageSwitch />
        <PracticeMode />
        {lastError && <div className="toast-error">{lastError}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <LanguageSwitch />
      <HostAbandonBanner />
      {screen === 'lobby' && <Lobby />}
      {screen === 'room' && <Room />}
      {screen === 'game' && <Game />}
      {lastError && <div className="toast-error">{lastError}</div>}
    </div>
  );
}
