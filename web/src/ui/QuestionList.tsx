// Admin list page — browse, filter, inline-edit, delete, reorder, and save
// the question bank.  A banner reminds the user to persist changes.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { QuestionRow, QuestionKind } from '@fkzz/shared';
import { useT } from '../i18n';

// ---- Shared helpers (duplicated from the old QuestionBankAdmin) ----

export interface DraftRow {
  id: string;
  prompt: string;
  options: string[];
  kind: QuestionKind;
  answerIndex: number;
  answerIndexes: number[];
}

export function newId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyDraft(kind: QuestionKind, t: (k: string) => string): DraftRow {
  if (kind === 'judge') {
    return { id: newId(), prompt: '', options: [t('admin.judge.true'), t('admin.judge.false')], kind: 'judge', answerIndex: 0, answerIndexes: [] };
  }
  return { id: newId(), prompt: '', options: ['', '', '', ''], kind, answerIndex: 0, answerIndexes: kind === 'multi' ? [0] : [] };
}

export function rowToDraft(row: QuestionRow): DraftRow {
  const kind: QuestionKind = row.kind ?? 'single';
  return {
    id: row.id, prompt: row.prompt, options: row.options.slice(), kind,
    answerIndex: row.answerIndex,
    answerIndexes: row.answerIndexes ? row.answerIndexes.slice() : (kind === 'multi' ? [row.answerIndex] : []),
  };
}

export function draftToRow(d: DraftRow): QuestionRow {
  const base: QuestionRow = {
    id: d.id.trim() || newId(), prompt: d.prompt.trim(),
    options: d.options.map(o => o.trim()), answerIndex: d.answerIndex, kind: d.kind,
  };
  if (d.kind === 'multi') {
    const sorted = Array.from(new Set(d.answerIndexes)).sort((a, b) => a - b);
    base.answerIndexes = sorted;
    base.answerIndex = sorted[0] ?? 0;
  }
  return base;
}

export function validateDraft(d: DraftRow, t: (k: string) => string): string | null {
  if (!d.prompt.trim()) return t('admin.err.noPrompt');
  if (d.kind === 'judge') { if (d.options.length !== 2) return t('admin.err.judgeTwo'); }
  else { if (d.options.length < 2) return t('admin.err.minOptions'); }
  if (d.options.some(o => !o.trim())) return t('admin.err.emptyOption');
  if (d.kind === 'multi') { if (d.answerIndexes.length < 1) return t('admin.err.multiAtLeastOne'); }
  else { if (d.answerIndex < 0 || d.answerIndex >= d.options.length) return t('admin.err.answerOutOfRange'); }
  return null;
}

// ---- Auto-resize textarea ----

function AutoTextarea(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [props.value]);
  return <textarea ref={ref} className="qb-autogrow" value={props.value} onChange={e => props.onChange(e.target.value)} placeholder={props.placeholder} rows={2} />;
}

// ---- Component ----

interface Props {
  rows: DraftRow[];
  setRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
  pendingCount: number;
  onSaved?: (count: number) => void;
  onRefresh?: () => Promise<void>;
}

export default function QuestionList({ rows, setRows, pendingCount, onSaved, onRefresh }: Props) {
  const t = useT();
  const [filterKind, setFilterKind] = useState<'all' | QuestionKind>('all');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Pull-to-refresh state (mobile)
  const touchStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const PULL_THRESHOLD = 60;

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing || saving) return;
    if (pendingCount > 0) {
      const ok = confirm(t('admin.refreshConfirmLose'));
      if (!ok) { setPullDistance(0); return; }
    }
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh, refreshing, saving, pendingCount, t]);

  // Touch handlers for pull-to-refresh
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only activate when at top of page
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0]!.clientY;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === 0) return;
    const deltaY = e.touches[0]!.clientY - touchStartY.current;
    if (deltaY > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(deltaY * 0.5, 100));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    touchStartY.current = 0;
  }, [pullDistance, handleRefresh]);

  // ---- Row operations ----

  const updateRow = (idx: number, patch: Partial<DraftRow>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const removeRow = (idx: number) => {
    if (!confirm(t('admin.confirmDelete'))) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const addOption = (idx: number) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, options: [...r.options, ''] } : r));

  const removeOption = (idx: number, optIdx: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (r.options.length <= 2) return r;
      const options = r.options.filter((_, j) => j !== optIdx);
      let answerIndex = r.answerIndex;
      if (optIdx < answerIndex) answerIndex--;
      else if (optIdx === answerIndex) answerIndex = 0;
      const answerIndexes = r.answerIndexes.filter(ix => ix !== optIdx).map(ix => ix > optIdx ? ix - 1 : ix);
      return { ...r, options, answerIndex, answerIndexes };
    }));
  };

  const setOption = (idx: number, optIdx: number, value: string) =>
    setRows(prev => prev.map((r, i) => i !== idx ? r : { ...r, options: r.options.map((o, j) => j === optIdx ? value : o) }));

  const toggleMultiAnswer = (idx: number, optIdx: number) =>
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const has = r.answerIndexes.includes(optIdx);
      const next = has ? r.answerIndexes.filter(x => x !== optIdx) : [...r.answerIndexes, optIdx];
      return { ...r, answerIndexes: next.sort((a, b) => a - b) };
    }));

  const changeKind = (idx: number, kind: QuestionKind) =>
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (kind === 'judge') return { ...r, kind, options: [t('admin.judge.true'), t('admin.judge.false')], answerIndex: 0, answerIndexes: [] };
      if (kind === 'multi') return { ...r, kind, answerIndexes: r.answerIndexes.length ? r.answerIndexes : [r.answerIndex] };
      return { ...r, kind: 'single', answerIndexes: [] };
    }));

  const moveRow = (from: number, to: number) => {
    setRows(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };

  // ---- Save ----

  const save = async () => {
    setMessage(null);
    for (let i = 0; i < rows.length; i++) {
      const err = validateDraft(rows[i]!, t);
      if (err) { setMessage({ type: 'err', text: `#${i + 1}: ${err}` }); return; }
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
      onSaved?.(body.count);
    } catch (e) {
      setMessage({ type: 'err', text: t('admin.err.saveFailed') + ': ' + (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // ---- Filtered view ----

  const visibleRows = rows
    .map((row, i) => ({ row, idx: i }))
    .filter(({ row }) => filterKind === 'all' || row.kind === filterKind);

  const dirtyCount = pendingCount;

  // ---- Render ----

  return (
    <div
      className="qb-admin"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className={'qb-pull-indicator' + (pullDistance > 0 ? ' qb-pull-visible' : '') + (refreshing ? ' qb-pull-active' : '')}
        style={{ height: pullDistance }}
      >
        {refreshing ? (
          <span className="qb-pull-spinner" />
        ) : pullDistance >= PULL_THRESHOLD ? (
          <span>{t('admin.pullRelease')}</span>
        ) : (
          <span>{t('admin.pullDown')}</span>
        )}
      </div>

      {/* Header */}
      <div className="qb-header">
        <h1>{t('admin.listTitle')}</h1>
        <div className="qb-header-actions">
          <button
            className="ghost qb-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing || saving}
            title={t('admin.refresh')}
          >
            {refreshing ? '…' : '↻'}
          </button>
          <a href="#admin/questions/add" className="btn-add-link">{t('admin.addQuestion')}</a>
          <button className="primary" onClick={save} disabled={saving || refreshing}>
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
        </div>
      </div>

      {/* Pending-save banner */}
      {dirtyCount > 0 && (
        <div className="qb-banner qb-banner-warn">
          {t('admin.pendingSave', { n: dirtyCount })}
        </div>
      )}

      {message && (
        <div className={'qb-msg ' + (message.type === 'ok' ? 'qb-msg-ok' : 'qb-msg-err')}>
          {message.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="qb-toolbar">
        <div className="qb-add-group">
          <span className="qb-add-label">{t('admin.filter')}:</span>
          <select className="qb-filter-select" value={filterKind} onChange={e => setFilterKind(e.target.value as any)}>
            <option value="all">{t('admin.filter.all')} ({rows.length})</option>
            <option value="single">{t('admin.kind.single')} ({rows.filter(r => r.kind === 'single').length})</option>
            <option value="multi">{t('admin.kind.multi')} ({rows.filter(r => r.kind === 'multi').length})</option>
            <option value="judge">{t('admin.kind.judge')} ({rows.filter(r => r.kind === 'judge').length})</option>
          </select>
        </div>
        <div className="qb-header-actions qb-toolbar-actions">
          <a href="#admin/questions/add" className="btn-add-link">{t('admin.addQuestion')}</a>
        </div>
      </div>

      {/* List */}
      {visibleRows.length === 0 ? (
        <p className="qb-empty">{t('admin.empty')}</p>
      ) : (
        <ul className="qb-list">
          {visibleRows.map(({ row, idx }) => (
            <li key={row.id} className="qb-card">
              <div className="qb-card-head">
                <span className="qb-card-no">#{idx + 1}</span>
                <div className="qb-sort-buttons">
                  <button className="qb-sort-btn" onClick={() => moveRow(idx, idx - 1)} disabled={idx === 0} title={t('admin.moveUp')}>↑</button>
                  <button className="qb-sort-btn" onClick={() => moveRow(idx, idx + 1)} disabled={idx >= visibleRows.length - 1} title={t('admin.moveDown')}>↓</button>
                </div>
                <select className="qb-kind-select" value={row.kind} onChange={e => changeKind(idx, e.target.value as QuestionKind)}>
                  <option value="single">{t('admin.kind.single')}</option>
                  <option value="multi">{t('admin.kind.multi')}</option>
                  <option value="judge">{t('admin.kind.judge')}</option>
                </select>
                <input className="qb-id" value={row.id} onChange={e => updateRow(idx, { id: e.target.value })} placeholder="id" />
                <button className="qb-del" onClick={() => removeRow(idx)}>{t('admin.delete')}</button>
              </div>

              <label className="qb-field">
                <span>{t('admin.prompt')}</span>
                <AutoTextarea value={row.prompt} onChange={v => updateRow(idx, { prompt: v })} placeholder={t('admin.promptPlaceholder')} />
              </label>

              <div className="qb-options">
                <div className="qb-options-head">
                  <span>{t('admin.options')}</span>
                  {row.kind !== 'judge' && (
                    <button className="qb-add-opt" onClick={() => addOption(idx)}>+ {t('admin.addOption')}</button>
                  )}
                </div>
                {row.options.map((opt, optIdx) => (
                  <div key={optIdx} className="qb-option-row">
                    {row.kind === 'multi' ? (
                      <input type="checkbox" checked={row.answerIndexes.includes(optIdx)} onChange={() => toggleMultiAnswer(idx, optIdx)} title={t('admin.markCorrect')} />
                    ) : (
                      <input type="radio" name={`ans-${row.id}`} checked={row.answerIndex === optIdx} onChange={() => updateRow(idx, { answerIndex: optIdx })} title={t('admin.markCorrect')} />
                    )}
                    <span className="qb-option-letter">{String.fromCharCode(65 + optIdx)}.</span>
                    <input className="qb-option-input" value={opt} onChange={e => setOption(idx, optIdx, e.target.value)} placeholder={t('admin.optionPlaceholder')} disabled={row.kind === 'judge'} />
                    {row.kind !== 'judge' && row.options.length > 2 && (
                      <button className="qb-rm-opt" onClick={() => removeOption(idx, optIdx)} title={t('admin.removeOption')}>×</button>
                    )}
                  </div>
                ))}
                {row.kind === 'multi' && (
                  <p className="qb-hint">{t('admin.multiHint', { ans: row.answerIndexes.map(i => String.fromCharCode(65 + i)).join(', ') || '—' })}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
