import React from 'react';
import { useStore } from '../state/store';
import type { Prompt } from '@fkzz/shared';

interface Props {
  prompt: Extract<Prompt, { kind: 'combat' }>;
}

export default function CombatModal({ prompt }: Props) {
  const combatRespond = useStore(s => s.combatRespond);

  return (
    <div className="modal-overlay">
      <div className="modal combat-modal">
        <h3>Combat</h3>
        <p className="combat-desc">{prompt.description}</p>
        <div className="combat-options">
          {prompt.options.map((opt) => (
            <button
              key={opt}
              className="primary"
              onClick={() => combatRespond(prompt.combatId, opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
