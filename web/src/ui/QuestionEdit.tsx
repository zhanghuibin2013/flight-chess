// Standalone question edit page.
// Loads a single question by id, shows the full edit form, and commits
// changes back via the parent-provided callbacks.

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { QuestionKind } from '@fkzz/shared';
import { useT } from '../i18n';
import { type DraftRow, validateDraft, rowToDraft, draftToRow } from './QuestionList';

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

interface Props {
  questionId: string;
  rows: DraftRow[];
  setRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
}

export default function QuestionEdit({ questionId, rows, setRows }: Props) {
  const t = useT();
  const idx = rows.findIndex(r => r.id === questionId);
  const initial = idx >= 0 ? rows[idx]! : null;
  const [draft, setDraft] = useState<DraftRow | null>(initial ? { ...initial, options: [...initial.options], answerIndexes: [...initial.answerIndexes] } : null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!draft || !initial) {
    return (
      <div className="qe-page">
        <div className="qe-header">
          <a href="#admin/questions" className="qe-back">← {t('admin.backToList')}</a>
        </div>
        <p className="qb-empty">{t('admin.err.notFound')}</p>
      </div>
    );
  }

  const update = (patch: Partial<DraftRow>) => setDraft(d => d ? { ...d, ...patch } : d);

  const changeKind = (kind: QuestionKind) => {
    if (kind === 'judge') update({ kind, options: [t('admin.judge.true'), t('admin.judge.false')], answerIndex: 0, answerIndexes: [] });
    else if (kind === 'multi') update({ kind, answerIndexes: draft.answerIndexes.length ? draft.answerIndexes : [draft.answerIndex] });
    else update({ kind: 'single', answerIndexes: [] });
  };

  const setOption = (optIdx: number, value: string) =>
    update({ options: draft.options.map((o, j) => j === optIdx ? value : o) });

  const addOption = () => update({ options: [...draft.options, ''] });

  const removeOption = (optIdx: number) => {
    if (draft.options.length <= 2) return;
    const options = draft.options.filter((_, j) => j !== optIdx);
    let answerIndex = draft.answerIndex;
    if (optIdx < answerIndex) answerIndex--;
    else if (optIdx === answerIndex) answerIndex = 0;
    const answerIndexes = draft.answerIndexes.filter(ix => ix !== optIdx).map(ix => ix > optIdx ? ix - 1 : ix);
    update({ options, answerIndex, answerIndexes });
  };

  const toggleAnswer = (optIdx: number) => {
    if (draft.kind === 'multi') {
      const has = draft.answerIndexes.includes(optIdx);
      const next = has ? draft.answerIndexes.filter(x => x !== optIdx) : [...draft.answerIndexes, optIdx].sort((a, b) => a - b);
      update({ answerIndexes: next, answerIndex: next[0] ?? 0 });
    } else {
      update({ answerIndex: optIdx });
    }
  };

  const handleSave = () => {
    const err = validateDraft(draft, t);
    if (err) { setMessage({ type: 'err', text: err }); return; }
    setRows(prev => prev.map((r, i) => i === idx ? { ...draft } : r));
    setMessage({ type: 'ok', text: t('admin.editSaved') });
    setTimeout(() => { window.location.hash = '#admin/questions'; }, 400);
  };

  const handleDelete = () => {
    if (!confirm(t('admin.confirmDelete'))) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
    window.location.hash = '#admin/questions';
  };

  return (
    <div className="qe-page">
      <div className="qe-header">
        <a href="#admin/questions" className="qe-back">← {t('admin.backToList')}</a>
        <h1>{t('admin.editTitle')}</h1>
        <div className="qe-actions">
          <button className="qe-btn-del" onClick={handleDelete}>{t('admin.delete')}</button>
          <button className="primary" onClick={handleSave}>{t('admin.editSave')}</button>
        </div>
      </div>

      {message && (
        <div className={'qb-msg ' + (message.type === 'ok' ? 'qb-msg-ok' : 'qb-msg-err')}>{message.text}</div>
      )}

      <div className="qe-form">
        <div className="qe-meta">
          <span className="qe-id">{draft.id}</span>
          <span className="qe-idx">#{idx + 1}</span>
        </div>

        <label className="qe-field">
          <span>{t('admin.kindLabel')}</span>
          <select value={draft.kind} onChange={e => changeKind(e.target.value as QuestionKind)}>
            <option value="single">{t('admin.kind.single')}</option>
            <option value="multi">{t('admin.kind.multi')}</option>
            <option value="judge">{t('admin.kind.judge')}</option>
          </select>
        </label>

        <label className="qe-field">
          <span>{t('admin.prompt')}</span>
          <AutoTextarea value={draft.prompt} onChange={v => update({ prompt: v })} placeholder={t('admin.promptPlaceholder')} />
        </label>

        <div className="qe-field">
          <div className="qe-options-head">
            <span>{t('admin.options')}</span>
            {draft.kind !== 'judge' && (
              <button className="aa-btn-small" onClick={addOption}>+ {t('admin.addOption')}</button>
            )}
          </div>
          {draft.options.map((opt, oi) => (
            <div key={oi} className="aa-option-row">
              {draft.kind === 'multi' ? (
                <input type="checkbox" checked={draft.answerIndexes.includes(oi)} onChange={() => toggleAnswer(oi)} title={t('admin.markCorrect')} />
              ) : (
                <input type="radio" name="qe-answer" checked={draft.answerIndex === oi} onChange={() => toggleAnswer(oi)} title={t('admin.markCorrect')} />
              )}
              <span className="aa-opt-letter">{String.fromCharCode(65 + oi)}.</span>
              <input className="aa-opt-input" value={opt} onChange={e => setOption(oi, e.target.value)} placeholder={t('admin.optionPlaceholder')} disabled={draft.kind === 'judge'} />
              {draft.kind !== 'judge' && draft.options.length > 2 && (
                <button className="aa-btn-rm" onClick={() => removeOption(oi)}>×</button>
              )}
            </div>
          ))}
          {draft.kind === 'multi' && (
            <p className="aa-hint">{t('admin.multiHint', { ans: draft.answerIndexes.map(i => String.fromCharCode(65 + i)).join(', ') || '—' })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
