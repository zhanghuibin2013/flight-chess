import React from 'react';
import { useLocale } from '../i18n';

/** Small EN/中 toggle button. Visible everywhere via a fixed corner placement. */
export default function LanguageSwitch() {
  const [locale, setLocale] = useLocale();
  const next = locale === 'zh' ? 'en' : 'zh';
  const label = locale === 'zh' ? 'EN' : '中';
  return (
    <button
      type="button"
      className="lang-switch"
      title="Switch language / 切换语言"
      onClick={() => setLocale(next)}
    >
      {label}
    </button>
  );
}
