// Question-bank entry / admin page.
// Reads & writes the server-side data/questions.json via /admin/questions.
// Three supported question kinds: single-choice, multi-choice, judge (true/false).

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { QuestionRow, QuestionKind } from '@fkzz/shared';
import { useT } from '../i18n';

interface DraftRow {
  id: string;
  prompt: string;
  options: string[];
  kind: QuestionKind;
  /** For single & judge: the single correct index. */
  answerIndex: number;
  /** For multi: set of correct indexes. */
  answerIndexes: number[];
}

/** Build a stable-ish id for a brand-new row. */
function newId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `q-${ts}-${rnd}`;
}

/**
 * <textarea> that auto-grows to fit its content. Resets height to 'auto'
 * first so it can also shrink when text is deleted.
 */
function AutoTextarea(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      className="qb-autogrow"
      value={props.value}
      onChange={e => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      rows={2}
    />
  );
}

function emptyDraft(kind: QuestionKind, t: (k: string) => string): DraftRow {
  if (kind === 'judge') {
    return {
      id: newId(),
      prompt: '',
      options: [t('admin.judge.true'), t('admin.judge.false')],
      kind: 'judge',
      answerIndex: 0,
      answerIndexes: [],
    };
  }
  return {
    id: newId(),
    prompt: '',
    options: ['', '', '', ''],
    kind,
    answerIndex: 0,
    answerIndexes: kind === 'multi' ? [0] : [],
  };
}

function rowToDraft(row: QuestionRow): DraftRow {
  const kind: QuestionKind = row.kind ?? 'single';
  return {
    id: row.id,
    prompt: row.prompt,
    options: row.options.slice(),
    kind,
    answerIndex: row.answerIndex,
    answerIndexes: row.answerIndexes ? row.answerIndexes.slice() : (kind === 'multi' ? [row.answerIndex] : []),
  };
}

function draftToRow(d: DraftRow): QuestionRow {
  const base: QuestionRow = {
    id: d.id.trim() || newId(),
    prompt: d.prompt.trim(),
    options: d.options.map(o => o.trim()),
    answerIndex: d.answerIndex,
    kind: d.kind,
  };
  if (d.kind === 'multi') {
    const sorted = Array.from(new Set(d.answerIndexes)).sort((a, b) => a - b);
    base.answerIndexes = sorted;
    base.answerIndex = sorted[0] ?? 0;
  }
  return base;
}

function validateDraft(d: DraftRow, t: (k: string) => string): string | null {
  if (!d.prompt.trim()) return t('admin.err.noPrompt');
  if (d.kind === 'judge') {
    if (d.options.length !== 2) return t('admin.err.judgeTwo');
  } else {
    if (d.options.length < 2) return t('admin.err.minOptions');
  }
  if (d.options.some(o => !o.trim())) return t('admin.err.emptyOption');
  if (d.kind === 'multi') {
    if (d.answerIndexes.length < 1) return t('admin.err.multiAtLeastOne');
  } else {
    if (d.answerIndex < 0 || d.answerIndex >= d.options.length) return t('admin.err.answerOutOfRange');
  }
  return null;
}

export default function QuestionBankAdmin() {
  const t = useT();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [filterKind, setFilterKind] = useState<'all' | QuestionKind>('all');

  // Initial load from the server. Runs once on mount — do NOT depend on `t`,
  // because useT() returns a fresh function reference on every render, which
  // would otherwise turn this into an infinite GET loop.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/admin/questions');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as QuestionRow[];
        if (!cancelled) setRows(data.map(rowToDraft));
      } catch (e) {
        if (!cancelled) setMessage({ type: 'err', text: t('admin.err.loadFailed') + ': ' + (e as Error).message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = () => {
    // Returning to the lobby simply means clearing the hash and reloading
    // so the main App router renders <Lobby /> again.
    window.location.hash = '';
    window.location.reload();
  };

  const addRow = (kind: QuestionKind) => {
    setRows(prev => [emptyDraft(kind, t), ...prev]);
  };

  const updateRow = (idx: number, patch: Partial<DraftRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const removeRow = (idx: number) => {
    if (!confirm(t('admin.confirmDelete'))) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const addOption = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, options: [...r.options, ''] } : r));
  };

  const removeOption = (idx: number, optIdx: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (r.options.length <= 2) return r; // keep at least 2
      const options = r.options.filter((_, j) => j !== optIdx);
      // re-map answer indexes
      let answerIndex = r.answerIndex;
      if (optIdx < answerIndex) answerIndex--;
      else if (optIdx === answerIndex) answerIndex = 0;
      const answerIndexes = r.answerIndexes
        .filter(ix => ix !== optIdx)
        .map(ix => ix > optIdx ? ix - 1 : ix);
      return { ...r, options, answerIndex, answerIndexes };
    }));
  };

  const setOption = (idx: number, optIdx: number, value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const options = r.options.slice();
      options[optIdx] = value;
      return { ...r, options };
    }));
  };

  const toggleMultiAnswer = (idx: number, optIdx: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const has = r.answerIndexes.includes(optIdx);
      const next = has ? r.answerIndexes.filter(x => x !== optIdx) : [...r.answerIndexes, optIdx];
      return { ...r, answerIndexes: next.sort((a, b) => a - b) };
    }));
  };

  const changeKind = (idx: number, kind: QuestionKind) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (kind === 'judge') {
        return {
          ...r,
          kind,
          options: [t('admin.judge.true'), t('admin.judge.false')],
          answerIndex: 0,
          answerIndexes: [],
        };
      }
      if (kind === 'multi') {
        return { ...r, kind, answerIndexes: r.answerIndexes.length ? r.answerIndexes : [r.answerIndex] };
      }
      return { ...r, kind: 'single', answerIndexes: [] };
    }));
  };

  const moveRowUp = (idx: number) => {
    if (idx === 0) return;
    setRows(prev => {
      const newRows = [...prev];
      [newRows[idx - 1], newRows[idx]] = [newRows[idx], newRows[idx - 1]];
      return newRows;
    });
  };

  const moveRowDown = (idx: number) => {
    if (idx >= rows.length - 1) return;
    setRows(prev => {
      const newRows = [...prev];
      [newRows[idx], newRows[idx + 1]] = [newRows[idx + 1], newRows[idx]];
      return newRows;
    });
  };

  const save = async () => {
    setMessage(null);
    // Validate.
    for (let i = 0; i < rows.length; i++) {
      const err = validateDraft(rows[i]!, t);
      if (err) {
        setMessage({ type: 'err', text: `#${i + 1}: ${err}` });
        return;
      }
    }
    const payload = rows.map(draftToRow);
    setSaving(true);
    try {
      const res = await fetch('/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setMessage({ type: 'ok', text: t('admin.saved', { n: body.count }) });
    } catch (e) {
      setMessage({ type: 'err', text: t('admin.err.saveFailed') + ': ' + (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const visibleRows = rows
    .map((r, i) => ({ row: r, idx: i }))
    .filter(({ row }) => filterKind === 'all' || row.kind === filterKind);

  return (
    <div className="qb-admin">
      <div className="qb-header">
        <h1>{t('admin.title')}</h1>
        <div className="qb-header-actions">
          <button onClick={back}>{t('admin.back')}</button>
          <button className="primary" onClick={save} disabled={loading || saving}>
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
        </div>
      </div>

      <div className="qb-toolbar">
        <div className="qb-add-group">
          <span className="qb-add-label">{t('admin.add')}:</span>
          <button onClick={() => addRow('single')}>{t('admin.kind.single')}</button>
          <button onClick={() => addRow('multi')}>{t('admin.kind.multi')}</button>
          <button onClick={() => addRow('judge')}>{t('admin.kind.judge')}</button>
        </div>
        <div className="qb-filter-group">
          <span className="qb-add-label">{t('admin.filter')}:</span>
          <select value={filterKind} onChange={e => setFilterKind(e.target.value as any)}>
            <option value="all">{t('admin.filter.all')} ({rows.length})</option>
            <option value="single">{t('admin.kind.single')} ({rows.filter(r => r.kind === 'single').length})</option>
            <option value="multi">{t('admin.kind.multi')} ({rows.filter(r => r.kind === 'multi').length})</option>
            <option value="judge">{t('admin.kind.judge')} ({rows.filter(r => r.kind === 'judge').length})</option>
          </select>
        </div>
      </div>

      {message && (
        <div className={'qb-msg ' + (message.type === 'ok' ? 'qb-msg-ok' : 'qb-msg-err')}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p>{t('admin.loading')}</p>
      ) : visibleRows.length === 0 ? (
        <p className="qb-empty">{t('admin.empty')}</p>
      ) : (
        <ul className="qb-list">
          {visibleRows.map(({ row, idx }) => (
            <li key={row.id} className="qb-card">
              <div className="qb-card-head">
                <span className="qb-card-no">#{idx + 1}</span>
                <div className="qb-sort-buttons">
                  <button
                    className="qb-sort-btn"
                    onClick={() => moveRowUp(idx)}
                    disabled={idx === 0}
                    title={t('admin.moveUp')}
                  >
                    ↑
                  </button>
                  <button
                    className="qb-sort-btn"
                    onClick={() => moveRowDown(idx)}
                    disabled={idx >= visibleRows.length - 1}
                    title={t('admin.moveDown')}
                  >
                    ↓
                  </button>
                </div>
                <select
                  value={row.kind}
                  onChange={e => changeKind(idx, e.target.value as QuestionKind)}
                >
                  <option value="single">{t('admin.kind.single')}</option>
                  <option value="multi">{t('admin.kind.multi')}</option>
                  <option value="judge">{t('admin.kind.judge')}</option>
                </select>
                <input
                  className="qb-id"
                  value={row.id}
                  onChange={e => updateRow(idx, { id: e.target.value })}
                  placeholder="id"
                />
                <button className="qb-del" onClick={() => removeRow(idx)}>
                  {t('admin.delete')}
                </button>
              </div>

              <label className="qb-field">
                <span>{t('admin.prompt')}</span>
                <AutoTextarea
                  value={row.prompt}
                  onChange={v => updateRow(idx, { prompt: v })}
                  placeholder={t('admin.promptPlaceholder')}
                />
              </label>

              <div className="qb-options">
                <div className="qb-options-head">
                  <span>{t('admin.options')}</span>
                  {row.kind !== 'judge' && (
                    <button className="qb-add-opt" onClick={() => addOption(idx)}>
                      + {t('admin.addOption')}
                    </button>
                  )}
                </div>
                {row.options.map((opt, optIdx) => (
                  <div key={optIdx} className="qb-option-row">
                    {row.kind === 'multi' ? (
                      <input
                        type="checkbox"
                        checked={row.answerIndexes.includes(optIdx)}
                        onChange={() => toggleMultiAnswer(idx, optIdx)}
                        title={t('admin.markCorrect')}
                      />
                    ) : (
                      <input
                        type="radio"
                        name={`ans-${row.id}`}
                        checked={row.answerIndex === optIdx}
                        onChange={() => updateRow(idx, { answerIndex: optIdx })}
                        title={t('admin.markCorrect')}
                      />
                    )}
                    <span className="qb-option-letter">{String.fromCharCode(65 + optIdx)}.</span>
                    <input
                      className="qb-option-input"
                      value={opt}
                      onChange={e => setOption(idx, optIdx, e.target.value)}
                      placeholder={t('admin.optionPlaceholder')}
                      disabled={row.kind === 'judge'}
                    />
                    {row.kind !== 'judge' && row.options.length > 2 && (
                      <button
                        className="qb-rm-opt"
                        onClick={() => removeOption(idx, optIdx)}
                        title={t('admin.removeOption')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {row.kind === 'multi' && (
                  <p className="qb-hint">
                    {t('admin.multiHint', { ans: row.answerIndexes.map(i => String.fromCharCode(65 + i)).join(', ') || '—' })}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
