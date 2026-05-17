// Banner shown to the remaining players when the host has left/disconnected.
// The server starts a 60s disband timer (handlers.ts → HOST_ABANDON_MS); this
// component just visualises the deadline on the client.

import React, { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';

const TIMEOUT_MS = 60_000;

export default function HostAbandonBanner() {
  const room = useStore(s => s.room);
  const playerId = useStore(s => s.playerId);
  const t = useT();

  // Re-render every second while the banner is visible to drive the countdown.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!room?.hostAbandonedAt) return;
    const id = window.setInterval(() => setTick(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [room?.hostAbandonedAt]);

  if (!room || !room.hostAbandonedAt) return null;
  // Don't show the banner to the host themselves — they're the one missing.
  if (room.hostId === playerId) return null;

  const elapsed = Date.now() - room.hostAbandonedAt;
  const remainingMs = Math.max(0, TIMEOUT_MS - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="host-abandon-banner" role="alert">
      <div className="host-abandon-title">{t('room.hostLeft')}</div>
      <div className="host-abandon-sub">
        {t('room.hostLeftCountdown', { s: remainingSec })}
      </div>
    </div>
  );
}
