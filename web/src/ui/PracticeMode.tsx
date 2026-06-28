// Standalone knowledge-base practice mode.
// Random questions, immediate feedback, correct answer shown on mistakes,
// "previous" to review, "next" for a new random question.

import React, { useEffect, useState, useCallback } from 'react';
import type { QuestionRow, QuestionKind } from '@fkzz/shared';
import { useT } from '../i18n';

// ---- Types ----

interface HistoryEntry {
  question: QuestionRow;
  userAnswer: number;       // index the user selected
  isCorrect: boolean;
}

// ---- Helpers ----

function pickRandom<T>(arr: T[], exclude?: T): T {
  if (arr.length <= 1) return arr[0]!;
  let next: T;
  do { next = arr[Math.floor(Math.random() * arr.length)]!; }
  while (exclude !== undefined && next === exclude);
  return next;
}

const KIND_LABELS: Record<QuestionKind, string> = {
  single: 'admin.kind.single',
  multi: 'admin.kind.multi',
  judge: 'admin.kind.judge',
};

// ---- Component ----

export default function PracticeMode() {
  const t = useT();
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  // Current question
  const [current, setCurrent] = useState<QuestionRow | null>(null);

  // Answer state: number for single/judge, number[] for multi
  const [selected, setSelected] = useState<number | number[] | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // History for "previous" navigation
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [reviewIdx, setReviewIdx] = useState<number | null>(null); // non-null = reviewing history

  // Stats
  const [total, setTotal] = useState(0);
  const [correct, setCorrect] = useState(0);

  // Load questions on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/admin/questions');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as QuestionRow[];
        if (!cancelled) {
          setQuestions(data);
          if (data.length > 0) {
            setCurrent(pickRandom(data));
          }
        }
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Helper: is option i selected?
  const isSelected = (i: number): boolean => {
    if (selected === null) return false;
    if (Array.isArray(selected)) return selected.includes(i);
    return selected === i;
  };

  // Handle option click: toggle for multi, replace for single
  const handleSelect = (i: number) => {
    if (answered) return;
    if (current?.kind === 'multi') {
      setSelected(prev => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i].sort((a, b) => a - b);
      });
    } else {
      setSelected(i);
    }
  };

  const submit = useCallback(() => {
    if (selected === null || !current) return;
    const correctIdx = current.kind === 'multi'
      ? (current.answerIndexes ?? [current.answerIndex])
      : [current.answerIndex];
    const ok = current.kind === 'multi'
      ? Array.isArray(selected)
        && selected.length === correctIdx.length
        && correctIdx.every(c => selected.includes(c))
      : selected === correctIdx[0];
    setAnswered(true);
    setIsCorrect(ok);
    setTotal(prev => prev + 1);
    if (ok) setCorrect(prev => prev + 1);
    setHistory(prev => [...prev, { question: current, userAnswer: Array.isArray(selected) ? selected[0]! : selected, isCorrect: ok }]);
    setReviewIdx(null);
  }, [selected, current]);

  const nextQuestion = useCallback(() => {
    // If reviewing history and not at the most recent entry, move forward.
    if (reviewIdx !== null && reviewIdx < history.length - 1) {
      const nextIdx = reviewIdx + 1;
      const entry = history[nextIdx]!;
      setCurrent(entry.question);
      setSelected(entry.userAnswer);
      setAnswered(true);
      setIsCorrect(entry.isCorrect);
      setReviewIdx(nextIdx);
      return;
    }
    // Otherwise: pick a new random question.
    if (questions.length === 0) return;
    setCurrent(prev => pickRandom(questions, prev ?? undefined));
    setSelected(null);
    setAnswered(false);
    setIsCorrect(false);
    setReviewIdx(null);
  }, [questions, reviewIdx, history]);

  const prevQuestion = useCallback(() => {
    if (history.length === 0) return;
    // Go back one step in history.
    const newIdx = reviewIdx !== null
      ? Math.max(0, reviewIdx - 1)
      : history.length - 1;
    const entry = history[newIdx]!;
    setCurrent(entry.question);
    setSelected(entry.userAnswer);
    setAnswered(true);
    setIsCorrect(entry.isCorrect);
    setReviewIdx(newIdx);
  }, [history, reviewIdx]);

  const goBack = () => {
    window.location.hash = '';
    window.location.reload();
  };

  // ---- Render ----

  if (loading) {
    return (
      <div className="practice-page">
        <p>{t('admin.loading')}</p>
      </div>
    );
  }

  if (loadErr || questions.length === 0) {
    return (
      <div className="practice-page">
        <div className="practice-header">
          <button className="ghost" onClick={goBack}>← {t('common.exit')}</button>
        </div>
        <p className="qb-empty">
          {questions.length === 0 ? t('admin.empty') : t('admin.err.loadFailed') + ': ' + loadErr}
        </p>
      </div>
    );
  }

  const isReview = reviewIdx !== null;
  const correctIdx = current?.kind === 'multi'
    ? (current?.answerIndexes ?? [current?.answerIndex])
    : [current?.answerIndex];

  return (
    <div className="practice-page">
      {/* Header */}
      <div className="practice-header">
        <button className="ghost" onClick={goBack}>← {t('common.exit')}</button>
        <h1>{t('practice.title')}</h1>
        <div className="practice-stats">
          {t('practice.score', { correct, total })}
        </div>
      </div>

      {/* Question card */}
      {current && (
        <div className="practice-card">
          <div className="practice-card-head">
            <span className={'qbc-kind qbc-kind-' + (current.kind ?? 'single')}>
              {t(KIND_LABELS[current.kind ?? 'single'])}
            </span>
            {isReview && (
              <span className="practice-review-badge">
                {t('practice.reviewing', { n: reviewIdx! + 1, total: history.length })}
              </span>
            )}
          </div>

          <p className="practice-prompt">{current.prompt}</p>

          <ul className="practice-options">
            {current.options.map((opt, i) => {
              const isCorrectOption = correctIdx.includes(i);
              const sel = isSelected(i);
              let cls = 'practice-opt';
              if (answered) {
                if (isCorrectOption) cls += ' practice-opt-correct';
                if (sel && !isCorrectOption) cls += ' practice-opt-wrong';
              } else if (sel) {
                cls += ' practice-opt-selected';
              }
              return (
                <li key={i} className={cls} onClick={() => handleSelect(i)}>
                  {answered ? (
                    <span className="practice-opt-marker">
                      {isCorrectOption ? '✓' : sel ? '✗' : String.fromCharCode(65 + i) + '.'}
                    </span>
                  ) : (
                    <input
                      type={current.kind === 'multi' ? 'checkbox' : 'radio'}
                      name="practice"
                      checked={sel}
                      onChange={() => handleSelect(i)}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                  <span className="practice-opt-text">{opt}</span>
                </li>
              );
            })}
          </ul>

          {/* Feedback */}
          {answered && (
            <div className={'practice-feedback ' + (isCorrect ? 'practice-feedback-ok' : 'practice-feedback-err')}>
              {isCorrect ? t('practice.correct') : t('practice.wrong')}
              {!isCorrect && current.kind !== 'multi' && (
                <span className="practice-correct-hint">
                  {t('practice.correctAnswer', { ans: String.fromCharCode(65 + correctIdx[0]!) })}
                </span>
              )}
              {!isCorrect && current.kind === 'multi' && (
                <span className="practice-correct-hint">
                  {t('practice.correctAnswers', { ans: correctIdx.map(i => String.fromCharCode(65 + (i as number))).join('、') })}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="practice-nav">
        {!answered ? (
          <button
            className="practice-btn-primary"
            onClick={submit}
            disabled={selected === null || (Array.isArray(selected) && selected.length === 0)}
          >
            {t('practice.submit')}
          </button>
        ) : (
          <>
            <button
              className="practice-btn-secondary"
              onClick={prevQuestion}
              disabled={history.length === 0 || reviewIdx === 0}
            >
              ← {t('practice.prev')}
            </button>
            <button className="practice-btn-primary" onClick={nextQuestion}>
              {t('practice.next')} →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
