import React, { useState } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';
import type { Prompt } from '@fkzz/shared';

interface Props {
  prompt: Extract<Prompt, { kind: 'qa' }>;
}

export default function QAPrompt({ prompt }: Props) {
  const qaAnswer = useStore(s => s.qaAnswer);
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);

  const submit = () => {
    if (selected === null) return;
    qaAnswer(prompt.questionId, selected);
  };

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
