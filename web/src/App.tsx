import React, { useEffect, useState } from 'react';
import { useStore } from './state/store';
import Lobby from './ui/Lobby';
import Room from './ui/Room';
import Game from './ui/Game';
import LanguageSwitch from './ui/LanguageSwitch';
import HostAbandonBanner from './ui/HostAbandonBanner';
import QuestionBankAdmin from './ui/QuestionBankAdmin';

/** Returns true while the URL hash addresses the admin sub-app. */
function useIsAdminRoute(): boolean {
  const [isAdmin, setIsAdmin] = useState(() =>
    typeof window !== 'undefined' && window.location.hash.startsWith('#admin'));
  useEffect(() => {
    const onHash = () => setIsAdmin(window.location.hash.startsWith('#admin'));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return isAdmin;
}

export default function App() {
  const screen = useStore(s => s.screen);
  const lastError = useStore(s => s.lastError);
  const isAdmin = useIsAdminRoute();

  if (isAdmin) {
    // Admin is a stand-alone view (no game HUD, no language switch banner).
    return (
      <div className="app">
        <LanguageSwitch />
        <QuestionBankAdmin />
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
