// Admin add page — manually create or image-recognise questions into a
// pending list, then save them all at once back to the question bank.

import React, { useState } from 'react';
import type { QuestionKind } from '@fkzz/shared';
import { useT } from '../i18n';
import ImageRecognitionPanel from './ImageRecognitionPanel';
import type { RecognizedQuestion } from './ImageRecognitionPanel';
import { newId, type DraftRow } from './QuestionList';

// ---- Pending item (a question waiting to be committed) ----

interface PendingItem {
  uid: string;
  draft: DraftRow;
  source: 'manual' | 'image';
}

// ---- Helpers ----

function emptyDraft(kind: QuestionKind, t: (k: string) => string): DraftRow {
  if (kind === 'judge') {
    return { id: newId(), prompt: '', options: [t('admin.judge.true'), t('admin.judge.false')], kind: 'judge', answerIndex: 0, answerIndexes: [] };
  }
  return { id: newId(), prompt: '', options: ['', '', '', ''], kind, answerIndex: 0, answerIndexes: kind === 'multi' ? [0] : [] };
}

function recognizedToDraft(q: RecognizedQuestion): DraftRow {
  return {
    id: q.id || newId(),
    prompt: q.prompt,
    options: q.options.slice(),
    kind: q.kind,
    answerIndex: q.answerIndex,
    answerIndexes: q.answerIndexes.slice(),
  };
}

// ---- Types ----

type Tab = 'manual' | 'image';

interface Props {
  onSave: (drafts: DraftRow[]) => void;
}

// ---- Component ----

export default function AdminAdd({ onSave }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('manual');
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ---- Manual form state ----

  const [formKind, setFormKind] = useState<QuestionKind>('single');
  const [formPrompt, setFormPrompt] = useState('');
  const [formOptions, setFormOptions] = useState(['', '', '', '']);
  const [formAnswerIndex, setFormAnswerIndex] = useState(0);
  const [formAnswerIndexes, setFormAnswerIndexes] = useState<number[]>([]);

  const resetForm = (kind?: QuestionKind) => {
    const k = kind ?? formKind;
    setFormKind(k);
    setFormPrompt('');
    setFormOptions(k === 'judge' ? [t('admin.judge.true'), t('admin.judge.false')] : ['', '', '', '']);
    setFormAnswerIndex(0);
    setFormAnswerIndexes(k === 'multi' ? [0] : []);
  };

  const addFormToPending = () => {
    // Validate
    if (!formPrompt.trim()) { setMessage({ type: 'err', text: t('admin.err.noPrompt') }); return; }
    if (formKind === 'judge') { if (formOptions.length !== 2) { setMessage({ type: 'err', text: t('admin.err.judgeTwo') }); return; } }
    else { if (formOptions.length < 2) { setMessage({ type: 'err', text: t('admin.err.minOptions') }); return; } }
    if (formOptions.some(o => !o.trim())) { setMessage({ type: 'err', text: t('admin.err.emptyOption') }); return; }

    const draft: DraftRow = {
      id: newId(),
      prompt: formPrompt.trim(),
      options: formOptions.map(o => o.trim()),
      kind: formKind,
      answerIndex: formAnswerIndex,
      answerIndexes: formKind === 'multi' ? [...formAnswerIndexes].sort((a, b) => a - b) : [],
    };
    setPending(prev => [...prev, { uid: draft.id, draft, source: 'manual' }]);
    resetForm();
    setMessage({ type: 'ok', text: t('admin.addedToPending') });
  };

  // ---- Image recognition callback ----

  const handleRecognized = (questions: RecognizedQuestion[]) => {
    const items: PendingItem[] = questions.map(q => ({
      uid: q.id || newId(),
      draft: recognizedToDraft(q),
      source: 'image',
    }));
    setPending(prev => [...prev, ...items]);
    setMessage({ type: 'ok', text: t('admin.ir.addedToPendingCount', { n: items.length }) });
  };

  // ---- Pending list operations ----

  const removePending = (uid: string) => setPending(prev => prev.filter(p => p.uid !== uid));

  const updatePendingOption = (uid: string, optIdx: number, value: string) => {
    setPending(prev => prev.map(p => {
      if (p.uid !== uid) return p;
      return { ...p, draft: { ...p.draft, options: p.draft.options.map((o, j) => j === optIdx ? value : o) } };
    }));
  };

  const togglePendingAnswer = (uid: number | string, optIdx: number) => {
    const id = String(uid);
    setPending(prev => prev.map(p => {
      if (p.uid !== id) return p;
      const d = p.draft;
      if (d.kind === 'multi') {
        const has = d.answerIndexes.includes(optIdx);
        const next = has ? d.answerIndexes.filter(x => x !== optIdx) : [...d.answerIndexes, optIdx];
        const sorted = next.sort((a, b) => a - b);
        return { ...p, draft: { ...d, answerIndexes: sorted, answerIndex: sorted[0] ?? 0 } };
      }
      return { ...p, draft: { ...d, answerIndex: optIdx } };
    }));
  };

  const updatePendingPrompt = (uid: string, prompt: string) => {
    setPending(prev => prev.map(p => p.uid !== uid ? p : { ...p, draft: { ...p.draft, prompt } }));
  };

  // ---- Save ----

  const saveAll = () => {
    if (pending.length === 0) {
      setMessage({ type: 'err', text: t('admin.noPending') });
      return;
    }
    const drafts = pending.map(p => p.draft);
    onSave(drafts);
  };

  // ---- Render helpers ----

  const renderPendingList = () => {
    if (pending.length === 0) return null;
    return (
      <div className="aa-pending">
        <div className="aa-pending-header">
          <h3>{t('admin.pendingList')} ({pending.length})</h3>
          <button className="aa-btn-primary" onClick={saveAll}>{t('admin.saveAll')}</button>
        </div>
        {pending.map((p) => (
          <div key={p.uid} className="aa-pending-card">
            <div className="aa-pending-head">
              <span className="aa-pending-source">{p.source === 'manual' ? '✏️' : '📷'}</span>
              <span className="aa-pending-kind">{t(`admin.kind.${p.draft.kind}`)}</span>
              <button className="aa-btn-del" onClick={() => removePending(p.uid)}>{t('admin.delete')}</button>
            </div>
            <textarea
              className="aa-prompt-input"
              value={p.draft.prompt}
              onChange={e => updatePendingPrompt(p.uid, e.target.value)}
              rows={2}
            />
            <div className="aa-options">
              {p.draft.options.map((opt, oi) => (
                <div key={oi} className="aa-option-row">
                  {p.draft.kind === 'multi' ? (
                    <input type="checkbox" checked={p.draft.answerIndexes.includes(oi)}
                      onChange={() => togglePendingAnswer(p.uid, oi)} />
                  ) : (
                    <input type="radio" name={`pending-${p.uid}`}
                      checked={p.draft.answerIndex === oi}
                      onChange={() => togglePendingAnswer(p.uid, oi)} />
                  )}
                  <span className="aa-opt-letter">{String.fromCharCode(65 + oi)}.</span>
                  <input className="aa-opt-input" value={opt}
                    onChange={e => updatePendingOption(p.uid, oi, e.target.value)}
                    disabled={p.draft.kind === 'judge'} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="aa-pending-footer">
          <button className="aa-btn-primary" onClick={saveAll}>{t('admin.saveAll')} ({pending.length})</button>
        </div>
      </div>
    );
  };

  // ---- Main render ----

  return (
    <div className="aa-page">
      {/* Header */}
      <div className="aa-header">
        <a href="#admin" className="aa-back">← {t('admin.backToList')}</a>
        <h1>{t('admin.addTitle')}</h1>
        <div className="aa-header-actions">
          {pending.length > 0 && (
            <button className="primary" onClick={saveAll}>
              {t('admin.saveAll')} ({pending.length})
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="aa-tabs">
        <button className={'aa-tab' + (tab === 'manual' ? ' aa-tab-active' : '')} onClick={() => setTab('manual')}>
          ✏️ {t('admin.tabManual')}
        </button>
        <button className={'aa-tab' + (tab === 'image' ? ' aa-tab-active' : '')} onClick={() => setTab('image')}>
          📷 {t('admin.tabImage')}
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div className={'aa-msg ' + (message.type === 'ok' ? 'aa-msg-ok' : 'aa-msg-err')}>
          {message.text}
        </div>
      )}

      {/* Tab content */}
      {tab === 'manual' && (
        <div className="aa-manual">
          <div className="aa-form">
            {/* Kind selector */}
            <div className="aa-form-row">
              <label className="aa-field">
                <span>{t('admin.kindLabel')}</span>
                <select value={formKind} onChange={e => {
                  const k = e.target.value as QuestionKind;
                  resetForm(k);
                }}>
                  <option value="single">{t('admin.kind.single')}</option>
                  <option value="multi">{t('admin.kind.multi')}</option>
                  <option value="judge">{t('admin.kind.judge')}</option>
                </select>
              </label>
            </div>

            {/* Prompt */}
            <div className="aa-form-row">
              <label className="aa-field aa-field-full">
                <span>{t('admin.prompt')}</span>
                <textarea
                  className="aa-prompt-input"
                  value={formPrompt}
                  onChange={e => setFormPrompt(e.target.value)}
                  placeholder={t('admin.promptPlaceholder')}
                  rows={3}
                />
              </label>
            </div>

            {/* Options */}
            <div className="aa-form-row">
              <div className="aa-field aa-field-full">
                <div className="aa-options-header">
                  <span>{t('admin.options')}</span>
                  {formKind !== 'judge' && (
                    <button className="aa-btn-small" onClick={() => setFormOptions(prev => [...prev, ''])}>
                      + {t('admin.addOption')}
                    </button>
                  )}
                </div>
                {formOptions.map((opt, oi) => (
                  <div key={oi} className="aa-option-row">
                    {formKind === 'multi' ? (
                      <input type="checkbox"
                        checked={formAnswerIndexes.includes(oi)}
                        onChange={() => {
                          const has = formAnswerIndexes.includes(oi);
                          setFormAnswerIndexes(has ? formAnswerIndexes.filter(x => x !== oi) : [...formAnswerIndexes, oi].sort((a, b) => a - b));
                        }} />
                    ) : (
                      <input type="radio" name="form-answer"
                        checked={formAnswerIndex === oi}
                        onChange={() => setFormAnswerIndex(oi)} />
                    )}
                    <span className="aa-opt-letter">{String.fromCharCode(65 + oi)}.</span>
                    <input className="aa-opt-input" value={opt}
                      onChange={e => setFormOptions(prev => prev.map((o, j) => j === oi ? e.target.value : o))}
                      placeholder={t('admin.optionPlaceholder')}
                      disabled={formKind === 'judge'} />
                    {formKind !== 'judge' && formOptions.length > 2 && (
                      <button className="aa-btn-rm" onClick={() => {
                        setFormOptions(prev => {
                          const next = prev.filter((_, j) => j !== oi);
                          // Adjust answer indexes
                          if (oi < formAnswerIndex) setFormAnswerIndex(formAnswerIndex - 1);
                          else if (oi === formAnswerIndex) setFormAnswerIndex(0);
                          return next;
                        });
                      }}>×</button>
                    )}
                  </div>
                ))}
                {formKind === 'multi' && (
                  <p className="aa-hint">{t('admin.multiHint', { ans: formAnswerIndexes.map(i => String.fromCharCode(65 + i)).join(', ') || '—' })}</p>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="aa-form-actions">
              <button className="aa-btn-primary" onClick={addFormToPending}>
                {t('admin.addToPending')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'image' && (
        <div className="aa-image">
          <ImageRecognitionPanel onAdd={handleRecognized} />
        </div>
      )}

      {/* Pending list */}
      {renderPendingList()}
    </div>
  );
}
