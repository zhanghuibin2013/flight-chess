// Image-recognition panel for quick question-bank entry.
// Supports parallel processing: admin can upload multiple images, each
// recognised independently. While one image is being processed, the admin
// can already upload / shoot the next one.

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

type ItemStatus = 'pending' | 'recognizing' | 'done' | 'error';

interface QueueItem {
  uid: string;
  dataUrl: string;
  base64: string;
  mime: string;
  name: string;
  status: ItemStatus;
  questions: RecognizedQuestion[];
  error: string | null;
}

interface Props {
  onAdd: (questions: RecognizedQuestion[]) => void;
}

// ---- Helpers ----

let uidCounter = 0;
function uid(): string {
  return `ir-${Date.now().toString(36)}-${++uidCounter}`;
}

function qId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai:    { baseUrl: 'https://api.openai.com/v1',  model: 'gpt-4o' },
  anthropic: { baseUrl: 'https://api.anthropic.com',  model: 'claude-sonnet-4-20250514' },
};

function mapServerQuestions(raw: any[]): RecognizedQuestion[] {
  return raw.map((q, i) => ({
    id: q.id || qId(),
    prompt: q.prompt ?? '',
    options: Array.isArray(q.options) ? q.options : [],
    answerIndex: q.answerIndex ?? 0,
    kind: (q.kind === 'multi' || q.kind === 'judge' || q.kind === 'single') ? q.kind : 'single',
    answerIndexes: Array.isArray(q.answerIndexes)
      ? q.answerIndexes
      : (q.kind === 'multi' ? [q.answerIndex ?? 0] : []),
  }));
}

// ---- Component ----

export default function ImageRecognitionPanel({ onAdd }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  // Queue
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // AI config
  const [config, setConfig] = useState<AIConfig>({
    provider: 'openai', baseUrl: '', apiKey: '', model: '',
  });
  const [configDraft, setConfigDraft] = useState<AIConfig>({ ...config });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Global message
  const [globalMsg, setGlobalMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
          setConfigDraft({ ...cfg, apiKey: '' });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- File handling ----

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    // Pre-allocate slots so async FileReader onload callbacks can write
    // into the correct position regardless of completion order.
    const slots: (QueueItem | null)[] = arr.map(() => null);
    let validCount = 0;
    let loaded = 0;
    let tooLarge = false;

    arr.forEach((file, idx) => {
      if (file.size > 8 * 1024 * 1024) { tooLarge = true; return; }
      validCount++;
      const reader = new FileReader();
      const itemUid = uid();
      reader.onload = () => {
        const url = reader.result as string;
        const commaIdx = url.indexOf(',');
        slots[idx] = {
          uid: itemUid,
          dataUrl: url,
          base64: url.slice(commaIdx + 1),
          mime: file.type,
          name: file.name,
          status: 'pending',
          questions: [],
          error: null,
        };
        loaded++;
        if (loaded === validCount) {
          const newItems = slots.filter((s): s is QueueItem => s !== null);
          setQueue(prev => [...prev, ...newItems]);
        }
      };
      reader.readAsDataURL(file);
    });

    if (tooLarge) {
      setGlobalMsg({ type: 'err', text: '部分图片超过 8MB 限制，已跳过' });
    }
    // Reset file input
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  // ---- Per-item actions ----

  const removeItem = (itemUid: string) => {
    setQueue(prev => prev.filter(it => it.uid !== itemUid));
  };

  const updateQuestion = (itemUid: string, qIdx: number, patch: Partial<RecognizedQuestion>) => {
    setQueue(prev => prev.map(it => {
      if (it.uid !== itemUid) return it;
      const questions = it.questions.map((q, i) => i === qIdx ? { ...q, ...patch } : q);
      return { ...it, questions };
    }));
  };

  const updateOption = (itemUid: string, qIdx: number, optIdx: number, value: string) => {
    setQueue(prev => prev.map(it => {
      if (it.uid !== itemUid) return it;
      const questions = it.questions.map((q, qi) => {
        if (qi !== qIdx) return q;
        return { ...q, options: q.options.map((o, j) => j === optIdx ? value : o) };
      });
      return { ...it, questions };
    }));
  };

  const toggleAnswer = (itemUid: string, qIdx: number, optIdx: number) => {
    setQueue(prev => prev.map(it => {
      if (it.uid !== itemUid) return it;
      const questions = it.questions.map((q, qi) => {
        if (qi !== qIdx) return q;
        if (q.kind === 'multi') {
          const has = q.answerIndexes.includes(optIdx);
          const next = has
            ? q.answerIndexes.filter(x => x !== optIdx)
            : [...q.answerIndexes, optIdx].sort((a, b) => a - b);
          return { ...q, answerIndexes: next, answerIndex: next[0] ?? 0 };
        }
        return { ...q, answerIndex: optIdx };
      });
      return { ...it, questions };
    }));
  };

  const removeQuestion = (itemUid: string, qIdx: number) => {
    setQueue(prev => prev.map(it => {
      if (it.uid !== itemUid) return it;
      return { ...it, questions: it.questions.filter((_, i) => i !== qIdx) };
    }));
  };

  const addManualQuestion = (itemUid: string) => {
    const newQ: RecognizedQuestion = {
      id: qId(), prompt: '', options: ['', '', '', ''],
      answerIndex: 0, kind: 'single', answerIndexes: [],
    };
    setQueue(prev => prev.map(it =>
      it.uid !== itemUid ? it : { ...it, questions: [newQ, ...it.questions] }
    ));
  };

  const changeQuestionKind = (itemUid: string, qIdx: number, kind: QuestionKind) => {
    setQueue(prev => prev.map(it => {
      if (it.uid !== itemUid) return it;
      const questions = it.questions.map((q, qi) => {
        if (qi !== qIdx) return q;
        if (kind === 'judge') return { ...q, kind, options: ['正确', '错误'], answerIndex: 0, answerIndexes: [] } as RecognizedQuestion;
        if (kind === 'multi') return { ...q, kind, answerIndexes: [q.answerIndex] } as RecognizedQuestion;
        return { ...q, kind: 'single' as const, answerIndexes: [] };
      });
      return { ...it, questions };
    }));
  };

  // ---- Recognition (per item) ----

  const recognizeItem = async (itemUid: string) => {
    let item: QueueItem | undefined;
    setQueue(prev => {
      item = prev.find(it => it.uid === itemUid);
      if (!item) return prev;
      return prev.map(it => it.uid === itemUid ? { ...it, status: 'recognizing' as ItemStatus, error: null } : it);
    });
    if (!item) return;

    try {
      const res = await fetch('/admin/ai/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: item.base64, mimeType: item.mime }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const mapped = mapServerQuestions(body.questions ?? []);
      setQueue(prev => prev.map(it =>
        it.uid === itemUid
          ? { ...it, status: 'done' as ItemStatus, questions: mapped, error: null }
          : it
      ));
    } catch (e) {
      setQueue(prev => prev.map(it =>
        it.uid === itemUid
          ? { ...it, status: 'error' as ItemStatus, error: (e as Error).message }
          : it
      ));
    }
  };

  // ---- Bulk actions ----

  const pendingItems = queue.filter(it => it.status === 'pending');
  const doneItems = queue.filter(it => it.status === 'done');
  const totalQuestions = queue.reduce((sum, it) => sum + it.questions.length, 0);

  const recognizeAll = () => {
    pendingItems.forEach(it => recognizeItem(it.uid));
  };

  const clearDone = () => {
    setQueue(prev => prev.filter(it => it.status !== 'done'));
  };

  const clearAll = () => {
    setQueue([]);
    setGlobalMsg(null);
  };

  const addToBank = () => {
    const all = queue.flatMap(it => it.questions);
    if (all.length === 0) return;
    onAdd(all);
    setGlobalMsg({ type: 'ok', text: t('admin.ir.addedCount', { n: all.length }) });
    // Clear done items but keep pending / error items
    setQueue(prev => prev.filter(it => it.status !== 'done'));
  };

  // ---- AI Settings ----

  const changeProvider = (provider: 'openai' | 'anthropic') => {
    const defaults = PROVIDER_DEFAULTS[provider];
    setConfigDraft(prev => ({
      ...prev, provider,
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

  // ---- Render helpers ----

  const renderItem = (item: QueueItem) => {
    const isRecognizing = item.status === 'recognizing';
    const isDone = item.status === 'done';
    const isError = item.status === 'error';

    return (
      <div key={item.uid} className={'ir-item ir-item-' + item.status}>
        <div className="ir-item-left">
          <img className="ir-item-thumb" src={item.dataUrl} alt={item.name} />
        </div>
        <div className="ir-item-right">
          <div className="ir-item-head">
            <span className="ir-item-name" title={item.name}>{item.name}</span>
            {item.status === 'pending' && <span className="ir-status ir-status-pending">待识别</span>}
            {isRecognizing && <span className="ir-status ir-status-loading">识别中…</span>}
            {isDone && <span className="ir-status ir-status-done">
              {t('admin.ir.recognizedCount', { n: item.questions.length })}
            </span>}
            {isError && <span className="ir-status ir-status-err">失败</span>}
          </div>

          {/* Pending: show recognize + remove buttons */}
          {item.status === 'pending' && (
            <div className="ir-item-actions">
              <button className="ir-btn-primary ir-btn-sm" onClick={() => recognizeItem(item.uid)}>
                {t('admin.ir.recognize')}
              </button>
              <button className="ir-btn-secondary ir-btn-sm" onClick={() => removeItem(item.uid)}>
                {t('admin.delete')}
              </button>
            </div>
          )}

          {/* Recognizing: spinner */}
          {isRecognizing && (
            <div className="ir-item-actions">
              <span className="ir-spinner" />
              <span className="ir-item-hint">{t('admin.ir.recognizing')}</span>
            </div>
          )}

          {/* Error: show message + retry */}
          {isError && (
            <div className="ir-item-actions">
              <span className="ir-item-err-msg">{item.error}</span>
              <button className="ir-btn-secondary ir-btn-sm" onClick={() => recognizeItem(item.uid)}>
                重试
              </button>
              <button className="ir-btn-secondary ir-btn-sm" onClick={() => removeItem(item.uid)}>
                {t('admin.delete')}
              </button>
            </div>
          )}

          {/* Done: editable question list */}
          {isDone && (
            <div className="ir-item-questions">
              {item.questions.length === 0 && (
                <p className="ir-item-empty">{t('admin.ir.noResult')}</p>
              )}
              {item.questions.map((q, qi) => (
                <div key={q.id} className="ir-q-card">
                  <div className="ir-q-head">
                    <span className="ir-q-no">#{qi + 1}</span>
                    <select
                      value={q.kind}
                      onChange={e => changeQuestionKind(item.uid, qi, e.target.value as QuestionKind)}
                    >
                      <option value="single">{t('admin.kind.single')}</option>
                      <option value="multi">{t('admin.kind.multi')}</option>
                      <option value="judge">{t('admin.kind.judge')}</option>
                    </select>
                    <button className="ir-btn-del" onClick={() => removeQuestion(item.uid, qi)}>
                      {t('admin.delete')}
                    </button>
                  </div>
                  <textarea
                    className="ir-prompt-input"
                    value={q.prompt}
                    onChange={e => updateQuestion(item.uid, qi, { prompt: e.target.value })}
                    rows={2}
                  />
                  <div className="ir-options">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="ir-option-row">
                        {q.kind === 'multi' ? (
                          <input type="checkbox" checked={q.answerIndexes.includes(oi)}
                            onChange={() => toggleAnswer(item.uid, qi, oi)} />
                        ) : (
                          <input type="radio" name={`ir-${item.uid}-${q.id}`}
                            checked={q.answerIndex === oi}
                            onChange={() => toggleAnswer(item.uid, qi, oi)} />
                        )}
                        <span className="ir-opt-letter">{String.fromCharCode(65 + oi)}.</span>
                        <input className="ir-opt-input" value={opt}
                          onChange={e => updateOption(item.uid, qi, oi, e.target.value)}
                          disabled={q.kind === 'judge'} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button className="ir-btn-small" onClick={() => addManualQuestion(item.uid)}>
                + 手动添加
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ---- Main render ----

  return (
    <div className="ir-panel">
      {/* Header */}
      <div className="ir-panel-header">
        <span className="ir-panel-title">{t('admin.ir.title')}</span>
        <button
          className="ir-btn-ghost"
          onClick={() => setSettingsOpen(o => !o)}
        >
          {settingsOpen ? '▲ ' + t('admin.ir.collapse') : '⚙ ' + t('admin.ir.settings')}
        </button>
      </div>

      {/* Settings (collapsible) */}
      {settingsOpen && (
        <div className="ir-settings">
          <div className="ir-settings-grid">
            <label className="ir-field">
              <span>{t('admin.ir.provider')}</span>
              <select value={configDraft.provider}
                onChange={e => changeProvider(e.target.value as 'openai' | 'anthropic')}>
                <option value="openai">{t('admin.ir.provider.openai')}</option>
                <option value="anthropic">{t('admin.ir.provider.anthropic')}</option>
              </select>
            </label>
            <label className="ir-field">
              <span>{t('admin.ir.baseUrl')}</span>
              <input value={configDraft.baseUrl}
                onChange={e => setConfigDraft(d => ({ ...d, baseUrl: e.target.value }))}
                placeholder={PROVIDER_DEFAULTS[configDraft.provider].baseUrl} />
            </label>
            <label className="ir-field">
              <span>{t('admin.ir.apiKey')}</span>
              <input type="password" value={configDraft.apiKey}
                onChange={e => setConfigDraft(d => ({ ...d, apiKey: e.target.value }))}
                placeholder={config.apiKey && config.apiKey.endsWith('****')
                  ? config.apiKey : t('admin.ir.apiKeyPlaceholder')} />
            </label>
            <label className="ir-field">
              <span>{t('admin.ir.model')}</span>
              <input value={configDraft.model}
                onChange={e => setConfigDraft(d => ({ ...d, model: e.target.value }))}
                placeholder={PROVIDER_DEFAULTS[configDraft.provider].model} />
            </label>
          </div>
          <div className="ir-settings-actions">
            <button className="ir-btn-primary ir-btn-sm" onClick={saveSettings}>
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

      {/* Upload area — always visible */}
      <div
        className={'ir-upload' + (dragOver ? ' ir-upload-drag' : '')}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple
          style={{ display: 'none' }} onChange={onFileChange} />
        <div className="ir-upload-icon">📷</div>
        <div className="ir-upload-text">{t('admin.ir.uploadHint')}</div>
        <div className="ir-upload-formats">{t('admin.ir.formats')}</div>
      </div>

      {/* Global toolbar (shows when queue has items) */}
      {queue.length > 0 && (
        <div className="ir-toolbar">
          <div className="ir-toolbar-left">
            <span className="ir-toolbar-count">
              {queue.length} 张图片 · {totalQuestions} 道题目
            </span>
            {pendingItems.length > 0 && (
              <button className="ir-btn-primary ir-btn-sm" onClick={recognizeAll}>
                识别全部 ({pendingItems.length})
              </button>
            )}
            {doneItems.length > 0 && (
              <button className="ir-btn-secondary ir-btn-sm" onClick={clearDone}>
                清除已完成
              </button>
            )}
            <button className="ir-btn-secondary ir-btn-sm" onClick={clearAll}>
              {t('admin.ir.clear')}
            </button>
          </div>
          <div className="ir-toolbar-right">
            {doneItems.length > 0 && (
              <button className="ir-btn-primary" onClick={addToBank}>
                {t('admin.ir.addToBank')} ({totalQuestions})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Queue list */}
      {queue.length > 0 && (
        <div className="ir-queue">{queue.map(renderItem)}</div>
      )}

      {/* Global message */}
      {globalMsg && (
        <div className={'ir-msg ' + (globalMsg.type === 'ok' ? 'ir-msg-ok' : 'ir-msg-err')}>
          {globalMsg.text}
        </div>
      )}
    </div>
  );
}
