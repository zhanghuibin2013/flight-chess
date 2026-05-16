import React from 'react';
import { useStore } from '../state/store';
import type { Color } from '@fkzz/shared';

export default function ActionPanel() {
  const state = useStore(s => s.state);
  const isMyTurn = useStore(s => s.isMyTurn());
  const mySeat = useStore(s => s.mySeat()) as Color | null;
  const myPrompt = useStore(s => s.myPrompt());
  const rollDice = useStore(s => s.rollDice);
  const choosePlane = useStore(s => s.choosePlane);
  const chooseTakeoff = useStore(s => s.chooseTakeoff);
  const playCard = useStore(s => s.playCard);

  if (!state || !mySeat) return null;
  const myMissiles = state.hands[mySeat].missiles;
  const myRewards = state.hands[mySeat].heldRewards;

  return (
    <div className="action-panel">
      <div className="dice">
        <strong>{state.turn}'s turn</strong>
        {state.lastDice !== undefined && <span className="last-dice">🎲 {state.lastDice}</span>}
        {state.diceChain > 0 && <span className="chain">×{state.diceChain}</span>}
      </div>
      <div className="phase">phase: {state.phase}</div>
      {isMyTurn && state.phase === 'awaitRoll' && (
        <button className="primary big" onClick={rollDice}>Roll Dice</button>
      )}
      {myPrompt?.kind === 'move' && (
        <div className="prompt">
          <p>Choose a plane to move ({myPrompt.roll} steps):</p>
          <div className="plane-row">
            {myPrompt.planes.map(idx => (
              <button key={idx} className={`plane-btn plane-${mySeat}`} onClick={() => choosePlane(idx)}>#{idx + 1}</button>
            ))}
          </div>
        </div>
      )}
      {myPrompt?.kind === 'takeoff' && (
        <div className="prompt">
          <p>Take off:</p>
          <div className="plane-row">
            {myPrompt.planes.map(idx => (
              <button key={idx} className={`plane-btn plane-${mySeat}`} onClick={() => chooseTakeoff(idx)}>#{idx + 1}</button>
            ))}
          </div>
        </div>
      )}

      <div className="hand">
        <h4>My missiles</h4>
        {myMissiles.length === 0 && <em>none</em>}
        {myMissiles.map(m => (
          <div key={m.id} className="hand-card">
            <span>{m.kind.toUpperCase()}</span>
            {m.kind === 'arm' && (
              <select onChange={e => {
                const c = e.target.value as Color;
                if (c && c !== mySeat) playCard(m.id, { targetColor: c });
                e.target.value = '';
              }} defaultValue="">
                <option value="" disabled>Fire ARM at…</option>
                {(['red','yellow','blue','green'] as Color[]).filter(c => c !== mySeat).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            {m.kind === 'cruise' && (
              <CruiseLauncher cardId={m.id} mySeat={mySeat} />
            )}
          </div>
        ))}
      </div>

      <div className="hand">
        <h4>My reward cards</h4>
        {myRewards.length === 0 && <em>none</em>}
        {myRewards.map(r => (
          <div key={r.id} className="hand-card">
            <span>{r.kind}</span>
            {r.kind === 'enemySkip' && (
              <select onChange={e => {
                const c = e.target.value as Color;
                if (c && c !== mySeat) playCard(r.id, { targetColor: c });
                e.target.value = '';
              }} defaultValue="">
                <option value="" disabled>Make … skip</option>
                {(['red','yellow','blue','green'] as Color[]).filter(c => c !== mySeat).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CruiseLauncher({ cardId, mySeat }: { cardId: string; mySeat: Color }) {
  const state = useStore(s => s.state)!;
  const playCard = useStore(s => s.playCard);
  const targets: { c: Color; idx: number; label: string }[] = [];
  (['red','yellow','blue','green'] as Color[]).forEach(c => {
    if (c === mySeat) return;
    state.planes[c].forEach(p => {
      if (p.state !== 'onBoard' || p.progress === undefined) return;
      // takeoff cell or landing strip only
      if (p.progress === 0) targets.push({ c, idx: p.index, label: `${c}#${p.index + 1} on takeoff` });
      else if (p.progress >= 68 && p.progress < 73) targets.push({ c, idx: p.index, label: `${c}#${p.index + 1} in landing` });
    });
  });
  if (targets.length === 0) return <span>(no valid targets)</span>;
  return (
    <select onChange={e => {
      const v = e.target.value;
      if (!v) return;
      const [color, idx] = v.split(':');
      playCard(cardId, { targetColor: color as Color, targetPlaneIndex: Number(idx) });
      e.target.value = '';
    }} defaultValue="">
      <option value="" disabled>Cruise at…</option>
      {targets.map(t => (
        <option key={`${t.c}-${t.idx}`} value={`${t.c}:${t.idx}`}>{t.label}</option>
      ))}
    </select>
  );
}
