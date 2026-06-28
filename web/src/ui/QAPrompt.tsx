import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';
import type { Prompt } from '@fkzz/shared';

const COUNTDOWN_SECONDS = 5;

interface Props {
  prompt: Extract<Prompt, { kind: 'qa' }>;
  /** If true, render read-only spectator banner (no radio buttons, no submit). */
  readOnly?: boolean;
}

export default function QAPrompt({ prompt, readOnly }: Props) {
  const qaAnswer = useStore(s => s.qaAnswer);
  const qaProceed = useStore(s => s.qaProceed);
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasAnswer = prompt.selectedAnswer !== undefined;

  // Start countdown once the answer is submitted/visible.
  useEffect(() => {
    if (!hasAnswer) return;
    setSecondsLeft(COUNTDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [hasAnswer]);

  // Auto-proceed when countdown reaches 0.
  useEffect(() => {
    if (hasAnswer && secondsLeft === 0) {
      qaProceed();
    }
  }, [hasAnswer, secondsLeft, qaProceed]);

  const skip = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    qaProceed();
  };

  const submit = () => {
    if (selected === null) return;
    qaAnswer(prompt.questionId, selected);
    setSubmitted(true);
  };

  const isAnswering = !readOnly;
  const showResult = hasAnswer;

  // ---- Spectator / answered banner (non-answering players) ----
  if (readOnly) {
    return (
      <div className="qa-spectator">
        <div className="qa-spec-title">
          {showResult
            ? (prompt.correct ? t('qa.correct') : t('qa.wrong'))
            : t('qa.spectatorTitle')}
        </div>
        <p className="qa-spec-prompt">{prompt.prompt}</p>
        <div className="qa-spec-options">
          {prompt.options.map((opt, i) => (
            <span
              key={i}
              className={
                'qa-spec-opt' +
                (showResult && i === prompt.selectedAnswer
                  ? (prompt.correct ? ' qa-spec-correct' : ' qa-spec-wrong')
                  : '')
              }
            >
              {String.fromCharCode(65 + i)}. {opt}
            </span>
          ))}
        </div>
        {showResult && (
          <div className="qa-spec-footer">
            <span className="qa-spec-timer">{secondsLeft}s</span>
            <button className="qa-spec-skip" onClick={skip}>{t('qa.skipCountdown')}</button>
          </div>
        )}
      </div>
    );
  }

  // ---- Answering player modal ----
  if (!showResult) {
    // Not yet answered — show the interactive form.
    return (
      <div className="modal-overlay">
        <div className="modal qa-modal">
          <h3>{t('qa.title')}</h3>
          <p className="qa-prompt">{prompt.prompt}</p>
          <ul className="qa-options">
            {prompt.options.map((opt, i) => (
              <li key={i}>
                <label className={selected === i ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="qa"
                    checked={selected === i}
                    onChange={() => setSelected(i)}
                  />
                  {opt}
                </label>
              </li>
            ))}
          </ul>
          <button className="primary" disabled={selected === null} onClick={submit}>
            {t('qa.submit')}
          </button>
        </div>
      </div>
    );
  }

  // Answered — show result + countdown in the modal.
  const isCorrect = prompt.correct ?? false;
  return (
    <div className="modal-overlay">
      <div className="modal qa-modal">
        <h3>{t('qa.title')}</h3>
        <p className="qa-prompt">{prompt.prompt}</p>
        <ul className="qa-options">
          {prompt.options.map((opt, i) => {
            const isSelected = i === prompt.selectedAnswer;
            let cls = '';
            if (isSelected) {
              cls = isCorrect ? 'qa-opt-correct' : 'qa-opt-wrong';
            }
            return (
              <li key={i}>
                <label className={cls || undefined}>
                  <span className="qa-opt-marker">
                    {isSelected ? (isCorrect ? '✓' : '✗') : String.fromCharCode(65 + i) + '.'}
                  </span>
                  {opt}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="qa-result-bar">
          <span className={isCorrect ? 'qa-result-correct' : 'qa-result-wrong'}>
            {isCorrect ? t('qa.correct') : t('qa.wrong')}
          </span>
          <span className="qa-timer">{secondsLeft}s</span>
          <button className="ghost" onClick={skip}>{t('qa.skipCountdown')}</button>
        </div>
      </div>
    </div>
  );
}
