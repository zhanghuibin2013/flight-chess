// Admin list page — compact read-only cards.  Click a card to edit it on a
// dedicated page; use the action buttons to delete or reorder.

import React, { useCallback, useRef, useState } from 'react';
import type { QuestionRow, QuestionKind } from '@fkzz/shared';
import { useT } from '../i18n';

// ---- Shared helpers (re-used by QuestionEdit / QuestionAdd) ----

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

// ---- Helpers ----

const KIND_LABELS: Record<QuestionKind, string> = {
  single: 'admin.kind.single',
  multi: 'admin.kind.multi',
  judge: 'admin.kind.judge',
};

function correctLabel(row: DraftRow, t: (k: string) => string): string {
  if (row.kind === 'multi') {
    return row.answerIndexes.map(i => String.fromCharCode(65 + i)).join(', ') || '—';
  }
  return String.fromCharCode(65 + row.answerIndex);
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

  // Pull-to-refresh
  const touchStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const PULL_THRESHOLD = 60;

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing || saving) return;
    if (pendingCount > 0) {
      if (!confirm(t('admin.refreshConfirmLose'))) { setPullDistance(0); return; }
    }
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); setPullDistance(0); }
  }, [onRefresh, refreshing, saving, pendingCount, t]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) touchStartY.current = e.touches[0]!.clientY;
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === 0) return;
    const dy = e.touches[0]!.clientY - touchStartY.current;
    if (dy > 0 && window.scrollY === 0) setPullDistance(Math.min(dy * 0.5, 100));
  }, []);
  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) handleRefresh();
    else setPullDistance(0);
    touchStartY.current = 0;
  }, [pullDistance, handleRefresh]);

  // ---- Row operations (lightweight: delete + reorder only) ----

  const removeRow = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (!confirm(t('admin.confirmDelete'))) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const moveRow = (e: React.MouseEvent, from: number, to: number) => {
    e.stopPropagation();
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
    setSaving(true);
    try {
      const res = await fetch('/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.map(draftToRow)),
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

  // ---- Render ----

  return (
    <div
      className="qb-admin"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh */}
      <div
        className={'qb-pull-indicator' + (pullDistance > 0 ? ' qb-pull-visible' : '') + (refreshing ? ' qb-pull-active' : '')}
        style={{ height: pullDistance }}
      >
        {refreshing ? <span className="qb-pull-spinner" />
          : pullDistance >= PULL_THRESHOLD ? <span>{t('admin.pullRelease')}</span>
          : <span>{t('admin.pullDown')}</span>}
      </div>

      {/* Header */}
      <div className="qb-header">
        <h1>{t('admin.listTitle')}</h1>
        <div className="qb-header-actions">
          <button className="ghost qb-refresh-btn" onClick={handleRefresh} disabled={refreshing || saving} title={t('admin.refresh')}>
            {refreshing ? '…' : '↻'}
          </button>
          <a href="#admin/questions/add" className="btn-add-link">{t('admin.addQuestion')}</a>
          <button className="primary" onClick={save} disabled={saving || refreshing}>
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="qb-banner qb-banner-warn">{t('admin.pendingSave', { n: pendingCount })}</div>
      )}

      {message && (
        <div className={'qb-msg ' + (message.type === 'ok' ? 'qb-msg-ok' : 'qb-msg-err')}>{message.text}</div>
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
        <span className="qb-count-label">{t('admin.totalCount', { n: rows.length })}</span>
      </div>

      {/* Compact list */}
      {visibleRows.length === 0 ? (
        <p className="qb-empty">{t('admin.empty')}</p>
      ) : (
        <ul className="qb-list qb-list-compact">
          {visibleRows.map(({ row, idx }) => (
            <li
              key={row.id}
              className="qb-card-compact"
              onClick={() => { window.location.hash = `#admin/questions/edit/${row.id}`; }}
            >
              <div className="qbc-main">
                <div className="qbc-top">
                  <span className="qbc-no">#{idx + 1}</span>
                  <span className={'qbc-kind qbc-kind-' + row.kind}>{t(KIND_LABELS[row.kind])}</span>
                  <span className="qbc-answer" title={t('admin.correctAnswer')}>
                    ✓ {correctLabel(row, t)}
                  </span>
                </div>
                <p className="qbc-prompt">{row.prompt || <em className="qbc-empty-hint">{t('admin.err.noPrompt')}</em>}</p>
                {row.kind !== 'judge' && (
                  <div className="qbc-opts">
                    {row.options.map((opt, oi) => (
                      <span key={oi} className={'qbc-opt' + (
                        row.kind === 'multi'
                          ? (row.answerIndexes.includes(oi) ? ' qbc-opt-correct' : '')
                          : (row.answerIndex === oi ? ' qbc-opt-correct' : '')
                      )}>
                        {String.fromCharCode(65 + oi)}. {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="qbc-actions" onClick={e => e.stopPropagation()}>
                <button className="qb-sort-btn" onClick={e => moveRow(e, idx, idx - 1)} disabled={idx === 0} title={t('admin.moveUp')}>↑</button>
                <button className="qb-sort-btn" onClick={e => moveRow(e, idx, idx + 1)} disabled={idx >= visibleRows.length - 1} title={t('admin.moveDown')}>↓</button>
                <button className="qb-del" onClick={e => removeRow(e, idx)}>{t('admin.delete')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
