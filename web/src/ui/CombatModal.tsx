import React from 'react';
import { useStore } from '../state/store';
import { useT, translate, type Locale } from '../i18n';
import type { Color, Prompt } from '@fkzz/shared';

interface Props {
  prompt: Extract<Prompt, { kind: 'combat' }>;
}

const COLOR_KEYS: Record<Color, string> = {
  red: 'color.red', yellow: 'color.yellow', blue: 'color.blue', green: 'color.green',
};

export default function CombatModal({ prompt }: Props) {
  const combatRespond = useStore(s => s.combatRespond);
  const locale = useStore(s => s.locale) as Locale;
  const t = useT();

  // Server may pass a localized prompt key (descriptionKey) plus params; if so,
  // translate via i18n. Color-bearing params (attacker/defender) are looked up
  // via color.<value> so 'red' becomes "红方" / "Red".
  let body = prompt.description;
  if (prompt.descriptionKey) {
    const params: Record<string, string | number> = { ...(prompt.descriptionParams || {}) };
    for (const f of ['attacker', 'defender', 'color', 'target'] as const) {
      const v = params[f];
      if (typeof v === 'string' && (v in COLOR_KEYS)) {
        params[f] = t(COLOR_KEYS[v as Color]);
      }
    }
    const translated = translate(locale, prompt.descriptionKey, params);
    // Stale-dict guard: if the active bundle predates this key, translate()
    // returns the key itself. Prefer the server-provided English fallback
    // over leaking a raw i18n identifier into the UI.
    body = translated === prompt.descriptionKey ? prompt.description : translated;
  }

  return (
    <div className="modal-overlay">
      <div className="modal combat-modal">
        <h3>{t('combat.title')}</h3>
        <p className="combat-desc">{body}</p>
        <div className="combat-options">
          {prompt.options.map((opt) => (
            <button
              key={opt}
              className="primary"
              onClick={() => combatRespond(prompt.combatId, opt)}
            >
              {t(`combat.opt.${opt}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
