// Image-recognition panel for quick question-bank entry.
// Admin uploads a question image → server calls a multimodal AI → parsed
// questions are shown for review → admin clicks "Add to Bank" to inject them
// into the existing question list.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { QuestionKind } from '@fkzz/shared';
import { useT } from '../i18n';

// ---- Types ----

interface AIConfig {
  provider: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface RecognizedQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  kind: QuestionKind;
  answerIndexes: number[];
}

interface Props {
  onAdd: (questions: RecognizedQuestion[]) => void;
}

// ---- Helpers ----

function genId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai:    { baseUrl: 'https://api.openai.com/v1',     model: 'gpt-4o' },
  anthropic: { baseUrl: 'https://api.anthropic.com',     model: 'claude-sonnet-4-20250514' },
};

// ---- Component ----

export default function ImageRecognitionPanel({ onAdd }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  // AI config
  const [config, setConfig] = useState<AIConfig>({
    provider: 'openai', baseUrl: '', apiKey: '', model: '',
  });
  const [configDraft, setConfigDraft] = useState<AIConfig>(config);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Image & recognition
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mime, setMime] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [results, setResults] = useState<RecognizedQuestion[] | null>(null);
  const [panelMsg, setPanelMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Load AI config on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/admin/ai/config');
        if (!res.ok) return;
        const cfg = (await res.json()) as AIConfig;
        if (!cancelled) {
          setConfig(cfg);
          setConfigDraft({ ...cfg, apiKey: '' }); // Don't pre-fill masked key
          setConfigLoaded(true);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- File handling ----

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) {
      setPanelMsg({ type: 'err', text: 'Image too large (max 8MB)' });
      return;
    }
    setResults(null);
    setPanelMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setDataUrl(url);
      // Extract base64 part (after the comma) and the mime type
      const commaIdx = url.indexOf(',');
      setBase64(url.slice(commaIdx + 1));
      setMime(file.type);
    };
    reader.readAsDataURL(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const clearImage = () => {
    setDataUrl(null);
    setBase64(null);
    setMime('');
    setResults(null);
    setPanelMsg(null);
  };

  // ---- Recognition ----

  const recognize = async () => {
    if (!base64 || !mime) {
      setPanelMsg({ type: 'err', text: t('admin.ir.err.noImage') });
      return;
    }
    setRecognizing(true);
    setPanelMsg(null);
    setResults(null);
    try {
      const res = await fetch('/admin/ai/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: mime }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const questions = (body.questions ?? []) as any[];
      const mapped: RecognizedQuestion[] = questions.map((q, i) => ({
        id: q.id || genId(),
        prompt: q.prompt ?? '',
        options: q.options ?? [],
        answerIndex: q.answerIndex ?? 0,
        kind: (q.kind === 'multi' || q.kind === 'judge' || q.kind === 'single') ? q.kind : 'single',
        answerIndexes: q.answerIndexes ?? (q.kind === 'multi' ? [q.answerIndex ?? 0] : []),
      }));
      setResults(mapped);
      if (mapped.length === 0) {
        setPanelMsg({ type: 'err', text: t('admin.ir.noResult') });
      } else {
        setPanelMsg({ type: 'ok', text: t('admin.ir.recognizedCount', { n: mapped.length }) });
      }
    } catch (e) {
      setPanelMsg({ type: 'err', text: t('admin.ir.err.recognizeFailed', { msg: (e as Error).message }) });
    } finally {
      setRecognizing(false);
    }
  };

  // ---- Results editing ----

  const updateResult = (idx: number, patch: Partial<RecognizedQuestion>) => {
    setResults(prev => prev ? prev.map((r, i) => i === idx ? { ...r, ...patch } : r) : prev);
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setResults(prev => prev ? prev.map((r, qi) => {
      if (qi !== qIdx) return r;
      const options = r.options.slice();
      options[optIdx] = value;
      return { ...r, options };
    }) : prev);
  };

  const toggleAnswer = (qIdx: number, optIdx: number) => {
    setResults(prev => prev ? prev.map((r, qi) => {
      if (qi !== qIdx) return r;
      if (r.kind === 'multi') {
        const has = r.answerIndexes.includes(optIdx);
        const next = has
          ? r.answerIndexes.filter(x => x !== optIdx)
          : [...r.answerIndexes, optIdx].sort((a, b) => a - b);
        return { ...r, answerIndexes: next, answerIndex: next[0] ?? 0 };
      }
      return { ...r, answerIndex: optIdx };
    }) : prev);
  };

  const removeResult = (idx: number) => {
    setResults(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  };

  const addResult = () => {
    const newQ: RecognizedQuestion = {
      id: genId(),
      prompt: '',
      options: ['', '', '', ''],
      answerIndex: 0,
      kind: 'single',
      answerIndexes: [],
    };
    setResults(prev => prev ? [newQ, ...prev] : [newQ]);
  };

  // ---- Actions ----

  const handleAddToBank = () => {
    if (!results || results.length === 0) return;
    onAdd(results);
    setPanelMsg({ type: 'ok', text: t('admin.ir.addedCount', { n: results.length }) });
    setResults(null);
    setDataUrl(null);
    setBase64(null);
    setMime('');
  };

  const handleDiscard = () => {
    setResults(null);
    setPanelMsg(null);
  };

  // ---- AI Settings ----

  const changeProvider = (provider: 'openai' | 'anthropic') => {
    const defaults = PROVIDER_DEFAULTS[provider];
    setConfigDraft(prev => ({
      ...prev,
      provider,
      baseUrl: prev.baseUrl || defaults.baseUrl,
      model: prev.model || defaults.model,
    }));
  };

  const saveSettings = async () => {
    setSettingsMsg(null);
    try {
      const res = await fetch('/admin/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configDraft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setConfig({ ...configDraft });
      setSettingsMsg({ type: 'ok', text: t('admin.ir.settingsSaved') });
    } catch (e) {
      setSettingsMsg({ type: 'err', text: t('admin.ir.err.saveFailed', { msg: (e as Error).message }) });
    }
  };

  // ---- Render ----

  return (
    <div className="ir-panel">
      {/* Header */}
      <div className="ir-header" onClick={() => setSettingsOpen(o => !o)}>
        <span className="ir-header-title">{t('admin.ir.title')}</span>
        <span className="ir-header-toggle">
          {settingsOpen ? '▲ ' + t('admin.ir.collapse') : '▼ ' + t('admin.ir.expand')}
        </span>
      </div>

      {!settingsOpen && (
        <>
          {/* Upload area */}
          <div className="ir-body">
            <div
              className={'ir-upload' + (dragOver ? ' ir-upload-drag' : '') + (dataUrl ? ' ir-upload-hidden' : '')}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onFileChange}
              />
              <div className="ir-upload-icon">📷</div>
              <div className="ir-upload-text">{t('admin.ir.uploadHint')}</div>
              <div className="ir-upload-formats">{t('admin.ir.formats')}</div>
            </div>

            {/* Preview + results */}
            {dataUrl && (
              <div className="ir-content">
                <div className="ir-preview-col">
                  <img className="ir-preview-img" src={dataUrl} alt="preview" />
                  <div className="ir-preview-actions">
                    <button className="ir-btn-secondary" onClick={clearImage}>
                      {t('admin.ir.reselect')}
                    </button>
                  </div>
                </div>

                <div className="ir-result-col">
                  {results === null ? (
                    <div className="ir-actions">
                      <button
                        className="ir-btn-primary"
                        onClick={recognize}
                        disabled={recognizing}
                      >
                        {recognizing ? t('admin.ir.recognizing') : t('admin.ir.recognize')}
                      </button>
                      <button className="ir-btn-secondary" onClick={clearImage}>
                        {t('admin.ir.clear')}
                      </button>
                    </div>
                  ) : results.length > 0 ? (
                    <div className="ir-results">
                      <div className="ir-results-header">
                        <span>{t('admin.ir.recognizedCount', { n: results.length })}</span>
                        <button className="ir-btn-small" onClick={addResult}>+ 手动添加</button>
                      </div>
                      <div className="ir-results-list">
                        {results.map((q, qi) => (
                          <div key={q.id} className="ir-result-card">
                            <div className="ir-result-head">
                              <span className="ir-result-no">#{qi + 1}</span>
                              <select
                                value={q.kind}
                                onChange={e => {
                                  const kind = e.target.value as QuestionKind;
                                  if (kind === 'judge') {
                                    updateResult(qi, {
                                      kind,
                                      options: ['正确', '错误'],
                                      answerIndex: 0,
                                      answerIndexes: [],
                                    });
                                  } else if (kind === 'multi') {
                                    updateResult(qi, {
                                      kind,
                                      answerIndexes: [q.answerIndex],
                                    });
                                  } else {
                                    updateResult(qi, { kind: 'single', answerIndexes: [] });
                                  }
                                }}
                              >
                                <option value="single">{t('admin.kind.single')}</option>
                                <option value="multi">{t('admin.kind.multi')}</option>
                                <option value="judge">{t('admin.kind.judge')}</option>
                              </select>
                              <button className="ir-btn-del" onClick={() => removeResult(qi)}>
                                {t('admin.delete')}
                              </button>
                            </div>
                            <textarea
                              className="ir-prompt-input"
                              value={q.prompt}
                              onChange={e => updateResult(qi, { prompt: e.target.value })}
                              rows={2}
                            />
                            <div className="ir-options">
                              {q.options.map((opt, oi) => (
                                <div key={oi} className="ir-option-row">
                                  {q.kind === 'multi' ? (
                                    <input
                                      type="checkbox"
                                      checked={q.answerIndexes.includes(oi)}
                                      onChange={() => toggleAnswer(qi, oi)}
                                    />
                                  ) : (
                                    <input
                                      type="radio"
                                      name={`ir-ans-${q.id}`}
                                      checked={q.answerIndex === oi}
                                      onChange={() => toggleAnswer(qi, oi)}
                                    />
                                  )}
                                  <span className="ir-opt-letter">{String.fromCharCode(65 + oi)}.</span>
                                  <input
                                    className="ir-opt-input"
                                    value={opt}
                                    onChange={e => updateOption(qi, oi, e.target.value)}
                                    disabled={q.kind === 'judge'}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="ir-actions">
                        <button className="ir-btn-primary" onClick={handleAddToBank}>
                          {t('admin.ir.addToBank')}
                        </button>
                        <button className="ir-btn-secondary" onClick={handleDiscard}>
                          {t('admin.ir.discard')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {panelMsg && (
              <div className={'ir-msg ' + (panelMsg.type === 'ok' ? 'ir-msg-ok' : 'ir-msg-err')}>
                {panelMsg.text}
              </div>
            )}
          </div>
        </>
      )}

      {/* AI Settings panel */}
      {settingsOpen && (
        <div className="ir-settings">
          <div className="ir-settings-grid">
            <label className="ir-field">
              <span>{t('admin.ir.provider')}</span>
              <select
                value={configDraft.provider}
                onChange={e => changeProvider(e.target.value as 'openai' | 'anthropic')}
              >
                <option value="openai">{t('admin.ir.provider.openai')}</option>
                <option value="anthropic">{t('admin.ir.provider.anthropic')}</option>
              </select>
            </label>
            <label className="ir-field">
              <span>{t('admin.ir.baseUrl')}</span>
              <input
                value={configDraft.baseUrl}
                onChange={e => setConfigDraft(d => ({ ...d, baseUrl: e.target.value }))}
                placeholder={PROVIDER_DEFAULTS[configDraft.provider].baseUrl}
              />
            </label>
            <label className="ir-field">
              <span>{t('admin.ir.apiKey')}</span>
              <input
                type="password"
                value={configDraft.apiKey}
                onChange={e => setConfigDraft(d => ({ ...d, apiKey: e.target.value }))}
                placeholder={
                  config.apiKey && config.apiKey.endsWith('****')
                    ? config.apiKey
                    : t('admin.ir.apiKeyPlaceholder')
                }
              />
            </label>
            <label className="ir-field">
              <span>{t('admin.ir.model')}</span>
              <input
                value={configDraft.model}
                onChange={e => setConfigDraft(d => ({ ...d, model: e.target.value }))}
                placeholder={PROVIDER_DEFAULTS[configDraft.provider].model}
              />
            </label>
          </div>
          <div className="ir-settings-actions">
            <button className="ir-btn-primary" onClick={saveSettings}>
              {t('admin.ir.saveSettings')}
            </button>
            {settingsMsg && (
              <span className={'ir-msg-inline ' + (settingsMsg.type === 'ok' ? 'ir-msg-ok' : 'ir-msg-err')}>
                {settingsMsg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
