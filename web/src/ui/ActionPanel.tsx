import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useT, translate, type Locale } from '../i18n';
import type { Color, MissileKind, BoardSnapshot, GameState } from '@fkzz/shared';

const MISSILE_KINDS: MissileKind[] = ['aam', 'sam', 'arm', 'cruise'];
const MISSILE_KEYS: Record<MissileKind, string> = {
  aam: 'missile.aam',
  sam: 'missile.sam',
  arm: 'missile.arm',
  cruise: 'missile.cruise',
};
const COLOR_KEYS: Record<Color, string> = {
  red: 'color.red', yellow: 'color.yellow', blue: 'color.blue', green: 'color.green',
};

const PATH_LEN_TO_HOME = 73;
const LANDING_START_STEP = 68;

/** Return cellId on `color`'s path at the given progress. */
function cellIdAt(board: BoardSnapshot, color: Color, progress: number): number {
  const path = board.paths[color];
  if (progress >= PATH_LEN_TO_HOME) return path.home;
  if (progress >= LANDING_START_STEP) return path.landing[progress - LANDING_START_STEP]!;
  return path.ring[progress]!;
}

/** Best-plane recommendation among the prompt's candidates, by priority list:
 *  1) reaches home   2) hits own shortcut entry   3) missile factory
 *  4) radar factory  5) library (if QA deck non-empty)
 *  6) (takeoff)      7) closest to home (highest progress)
 *
 *  Note: a hangar plane spending a takeoff dice only moves to the takeoff
 *  cell (progress=0). It does NOT advance `roll` steps along the ring, so
 *  it cannot land on missile/radar/library/shortcut/home in one move.
 *
 *  Returns a translation KEY plus optional params, so the caller can render in
 *  the user's current locale. */
function recommendPlaneIdx(
  board: BoardSnapshot,
  state: GameState,
  color: Color,
  candidates: number[],
  roll: number | null,
): { idx: number; reasonKey: string; reasonParams?: Record<string, string | number> } | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return {
      idx: candidates[0]!,
      reasonKey: roll === null ? 'reason.onlyTakeoff' : 'reason.onlyMovable',
    };
  }

  // Takeoff prompt: pick the lowest-index plane (priority 6).
  if (roll === null) {
    return { idx: Math.min(...candidates), reasonKey: 'reason.takeoffLowest' };
  }

  const qaAvailable = state.deckCounts.questions > 0;

  type Score = { idx: number; tier: number; progress: number; reasonKey: string; reasonParams?: Record<string, string | number> };
  const scored: Score[] = candidates.map(idx => {
    const plane = state.planes[color][idx]!;
    const isHangar = plane.state === 'hangar';
    const fromProgress = plane.progress ?? 0;

    let tier = 99;
    let reasonKey = 'reason.closestProgress';
    let reasonParams: Record<string, string | number> | undefined = { p: fromProgress };

    if (isHangar) {
      // Hangar plane only travels to the takeoff cell (progress=0); it does
      // not advance along the ring on this turn. Treat it as a takeoff
      // action with priority 6.
      tier = 6;
      reasonKey = 'reason.takeoffToCell';
      reasonParams = undefined;
    } else {
      // Bounce-back when overshoot.
      let target = fromProgress + roll;
      let bounced = false;
      if (target > PATH_LEN_TO_HOME) {
        target = PATH_LEN_TO_HOME - (target - PATH_LEN_TO_HOME);
        bounced = true;
      }
      const reachesHome = !bounced && target >= PATH_LEN_TO_HOME;
      const destId = cellIdAt(board, color, target);
      const cell = board.cells.find(c => c.id === destId);
      const isShortcut = cell?.kind === 'shortcutEntry' && cell?.color === color;
      const isMissile = cell?.kind === 'missileFactory';
      const isRadar = cell?.kind === 'radarFactory';
      const isLibrary = cell?.kind === 'library' && qaAvailable;

      if (reachesHome) { tier = 1; reasonKey = 'reason.reachesHome'; reasonParams = undefined; }
      else if (isShortcut) { tier = 2; reasonKey = 'reason.shortcut'; reasonParams = undefined; }
      else if (isMissile) { tier = 3; reasonKey = 'reason.missileFactory'; reasonParams = undefined; }
      else if (isRadar) { tier = 4; reasonKey = 'reason.radarFactory'; reasonParams = undefined; }
      else if (isLibrary) { tier = 5; reasonKey = 'reason.library'; reasonParams = undefined; }
      else { tier = 7; }
    }

    return { idx, tier, progress: fromProgress, reasonKey, reasonParams };
  });

  // Lowest tier wins; within same tier, highest progress (closest to home) wins.
  scored.sort((a, b) => a.tier - b.tier || b.progress - a.progress || a.idx - b.idx);
  const best = scored[0]!;
  return { idx: best.idx, reasonKey: best.reasonKey, reasonParams: best.reasonParams };
}

export default function ActionPanel() {
  const state = useStore(s => s.state);
  const board = useStore(s => s.board);
  const isMyTurn = useStore(s => s.isMyTurn());
  const mySeat = useStore(s => s.mySeat()) as Color | null;
  const myPrompt = useStore(s => s.myPrompt());
  const rollDice = useStore(s => s.rollDice);
  const choosePlane = useStore(s => s.choosePlane);
  const chooseTakeoff = useStore(s => s.chooseTakeoff);
  const playCard = useStore(s => s.playCard);
  const leaveRoom = useStore(s => s.leaveRoom);
  const setHoverPlane = useStore(s => s.setHoverPlane);
  const locale = useStore(s => s.locale) as Locale;
  const t = useT();

  if (!state || !mySeat) {
    // Spectator / not seated: still allow exit.
    return (
      <div className="action-panel">
        <div className="action-header">
          <strong>{t('game.spectating')}</strong>
          <button className="ghost" onClick={() => { if (confirm(t('common.confirmLeave'))) leaveRoom(); }}>{t('common.exit')}</button>
        </div>
      </div>
    );
  }
  const myMissiles = state.hands[mySeat].missiles;
  const myRewards = state.hands[mySeat].heldRewards;
  const myRadars = state.hands[mySeat].radars;
  const missileCounts: Record<MissileKind, number> = { aam: 0, sam: 0, arm: 0, cruise: 0 };
  myMissiles.forEach(m => { missileCounts[m.kind]++; });

  const moveSuggestion = (board && myPrompt?.kind === 'move')
    ? recommendPlaneIdx(board, state, mySeat, myPrompt.planes, myPrompt.roll)
    : null;
  const takeoffSuggestion = (board && myPrompt?.kind === 'takeoff')
    ? recommendPlaneIdx(board, state, mySeat, myPrompt.planes, null)
    : null;

  // Dice animation: wild spin (rotation + face flicker) on every roll,
  // ending with a settle/pop. Triggers for ALL players when state.lastDice
  // changes (so spectators also see the animation), and immediately on
  // local Roll-Dice click for responsiveness.
  const [rolling, setRolling] = useState(false);
  const [spinFace, setSpinFace] = useState(1);
  const [popKey, setPopKey] = useState(0);
  const spinTimerRef = useRef<number | null>(null);
  // Tail duration: how long the spin continues AFTER the server result arrives.
  const SPIN_TAIL_MS = 800;
  // Hard cap: stop spinning no matter what, so a stuck spin can never persist.
  const SPIN_HARD_CAP_MS = 1800;

  const scheduleStop = (delay: number) => {
    if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current);
    spinTimerRef.current = window.setTimeout(() => {
      spinTimerRef.current = null;
      setRolling(false);
      setPopKey(k => k + 1);
    }, delay);
  };

  // Detect "a roll happened" by watching (turn, lastDice, diceChain) together.
  // Watching lastDice alone fails when the same value is rolled twice in a row
  // (e.g. when no plane can move and the engine immediately passes the turn).
  const prevSigRef = useRef<string>(`${state.turn}|${state.lastDice}|${state.diceChain}`);
  useEffect(() => {
    const sig = `${state.turn}|${state.lastDice}|${state.diceChain}`;
    if (sig !== prevSigRef.current) {
      prevSigRef.current = sig;
      if (state.lastDice !== undefined) {
        setRolling(true);
        scheduleStop(SPIN_TAIL_MS);
      }
    }
  }, [state.turn, state.lastDice, state.diceChain]);

  // Fast face flicker while spinning.
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setSpinFace(Math.floor(Math.random() * 6) + 1), 50);
    return () => clearInterval(id);
  }, [rolling]);

  const onRollClick = () => {
    setRolling(true);
    setSpinFace(Math.floor(Math.random() * 6) + 1);
    // Safety net: even if the server response produces no detectable state
    // delta (e.g. same dice value AND same chain AND same turn), the spin
    // will still terminate via the hard cap.
    scheduleStop(SPIN_HARD_CAP_MS);
    rollDice();
  };

  // Cleanup on unmount.
  useEffect(() => () => {
    if (spinTimerRef.current !== null) clearTimeout(spinTimerRef.current);
  }, []);

  return (
    <>
    <div className="action-panel">
      <div className="action-header">
        <strong>{t('game.turnLabel', { color: t(COLOR_KEYS[state.turn]) })}</strong>
        <button className="ghost" onClick={() => { if (confirm(t('common.confirmLeave'))) leaveRoom(); }}>{t('common.exit')}</button>
      </div>
      <div className="dice">
        {rolling ? (
          <span className="last-dice dice-rolling">🎲 {spinFace}</span>
        ) : (
          state.lastDice !== undefined && (
            <span key={popKey} className="last-dice dice-pop">🎲 {state.lastDice}</span>
          )
        )}
        {state.diceChain > 0 && <span className="chain">×{state.diceChain}</span>}
      </div>
      <div className="phase">{t('game.phase', { phase: t(`phase.${state.phase}`) })}</div>
      {isMyTurn && state.phase === 'awaitRoll' && (
        <button className="primary big" onClick={onRollClick} disabled={rolling}>
          {rolling ? t('game.rolling') : t('game.roll')}
        </button>
      )}
      {myPrompt?.kind === 'move' && (
        <div className="prompt">
          <p>{t('game.choosePlane', { n: myPrompt.roll })}
            {moveSuggestion !== null && (
              <span className="suggest-hint">
                {t('game.suggest', {
                  idx: moveSuggestion.idx + 1,
                  reason: translate(locale, moveSuggestion.reasonKey, moveSuggestion.reasonParams),
                })}
              </span>
            )}
          </p>
          <div className="plane-row">
            {myPrompt.planes.map(idx => (
              <button
                key={idx}
                className={`plane-btn plane-${mySeat} ${moveSuggestion?.idx === idx ? 'recommended' : ''}`}
                onClick={() => choosePlane(idx)}
                onMouseEnter={() => setHoverPlane(idx)}
                onMouseLeave={() => setHoverPlane(null)}
              >#{idx + 1}</button>
            ))}
          </div>
        </div>
      )}
      {myPrompt?.kind === 'takeoff' && (
        <div className="prompt">
          <p>{t('game.takeoff')}
            {takeoffSuggestion !== null && (
              <span className="suggest-hint">
                {t('game.suggest', {
                  idx: takeoffSuggestion.idx + 1,
                  reason: translate(locale, takeoffSuggestion.reasonKey, takeoffSuggestion.reasonParams),
                })}
              </span>
            )}
          </p>
          <div className="plane-row">
            {myPrompt.planes.map(idx => (
              <button
                key={idx}
                className={`plane-btn plane-${mySeat} ${takeoffSuggestion?.idx === idx ? 'recommended' : ''}`}
                onClick={() => chooseTakeoff(idx)}
              >#{idx + 1}</button>
            ))}
          </div>
        </div>
      )}

    </div>
    <div className="action-panel">
      <div className="hand">
        <h4>{t('game.arsenal')}</h4>
        <div className="arsenal-summary">
          <span className="arsenal-row">{t('game.radars')} <strong>{myRadars}</strong></span>
          {MISSILE_KINDS.map(k => (
            <span key={k} className="arsenal-row">🛩 {t(MISSILE_KEYS[k])}: <strong>{missileCounts[k]}</strong></span>
          ))}
        </div>
        {myMissiles.length > 0 && (
          <div className="hand-actions">
            <h4>{t('game.missile.actions')}</h4>
            {myMissiles.map(m => (
              <div key={m.id} className="hand-card">
                <span>{m.kind.toUpperCase()}</span>
                {m.kind === 'arm' && (
                  <select onChange={e => {
                    const c = e.target.value as Color;
                    if (c && c !== mySeat) playCard(m.id, { targetColor: c });
                    e.target.value = '';
                  }} defaultValue="">
                    <option value="" disabled>{t('game.fireARM')}</option>
                    {(['red','yellow','blue','green'] as Color[]).filter(c => c !== mySeat).map(c => (
                      <option key={c} value={c}>{t(COLOR_KEYS[c])}</option>
                    ))}
                  </select>
                )}
                {m.kind === 'cruise' && (
                  <CruiseLauncher cardId={m.id} mySeat={mySeat} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hand">
        <h4>{t('game.rewardCards')}</h4>
        {myRewards.length === 0 && <em>{t('common.none')}</em>}
        {myRewards.map(r => (
          <div key={r.id} className="hand-card">
            <span>{r.kind}</span>
            {r.kind === 'enemySkip' && (
              <select onChange={e => {
                const c = e.target.value as Color;
                if (c && c !== mySeat) playCard(r.id, { targetColor: c });
                e.target.value = '';
              }} defaultValue="">
                <option value="" disabled>{t('game.makeSkip')}</option>
                {(['red','yellow','blue','green'] as Color[]).filter(c => c !== mySeat).map(c => (
                  <option key={c} value={c}>{t(COLOR_KEYS[c])}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
    </>
  );
}

function CruiseLauncher({ cardId, mySeat }: { cardId: string; mySeat: Color }) {
  const state = useStore(s => s.state)!;
  const playCard = useStore(s => s.playCard);
  const t = useT();
  const targets: { c: Color; idx: number; label: string }[] = [];
  (['red','yellow','blue','green'] as Color[]).forEach(c => {
    if (c === mySeat) return;
    state.planes[c].forEach(p => {
      if (p.state !== 'onBoard' || p.progress === undefined) return;
      // takeoff cell or landing strip only
      if (p.progress === 0) targets.push({ c, idx: p.index, label: `${t(COLOR_KEYS[c])}#${p.index + 1} ${t('game.takeoffOnly')}` });
      else if (p.progress >= 68 && p.progress < 73) targets.push({ c, idx: p.index, label: `${t(COLOR_KEYS[c])}#${p.index + 1} ${t('game.inLanding')}` });
    });
  });
  if (targets.length === 0) return <span>{t('game.noTargets')}</span>;
  return (
    <select onChange={e => {
      const v = e.target.value;
      if (!v) return;
      const [color, idx] = v.split(':');
      playCard(cardId, { targetColor: color as Color, targetPlaneIndex: Number(idx) });
      e.target.value = '';
    }} defaultValue="">
      <option value="" disabled>{t('game.cruise')}</option>
      {targets.map(t2 => (
        <option key={`${t2.c}-${t2.idx}`} value={`${t2.c}:${t2.idx}`}>{t2.label}</option>
      ))}
    </select>
  );
}
