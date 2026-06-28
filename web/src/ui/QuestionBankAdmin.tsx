// Question-bank admin — top-level router.
// #admin                   → QuestionList  (browse, inline-edit, save)
// #admin/questions         → QuestionList
// #admin/questions/add     → QuestionAdd   (manual entry + image recognition)

import React, { useCallback, useEffect, useState } from 'react';
import type { QuestionRow } from '@fkzz/shared';
import { useT } from '../i18n';
import QuestionList, { type DraftRow, rowToDraft } from './QuestionList';
import QuestionAdd from './QuestionAdd';

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

export default function QuestionBankAdmin() {
  const t = useT();
  const hash = useHashRoute();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedCount, setSavedCount] = useState(0);
  const [globalMsg, setGlobalMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Fetch questions from server.
  const fetchQuestions = useCallback(async (): Promise<QuestionRow[]> => {
    const res = await fetch('/admin/questions');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as QuestionRow[];
  }, []);

  // Load questions on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchQuestions();
        if (!cancelled) {
          setRows(data.map(rowToDraft));
          setSavedCount(data.length);
        }
      } catch (e) {
        if (!cancelled) setGlobalMsg({ type: 'err', text: t('admin.err.loadFailed') + ': ' + (e as Error).message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Determine route: anything ending in /add → QuestionAdd, else → QuestionList
  const isAddRoute = hash.endsWith('/add');

  // How many rows were added but not yet saved.
  const pendingCount = Math.max(0, rows.length - savedCount);

  // When new questions come from the add page, prepend to rows.
  const handleAddFromAddPage = (drafts: DraftRow[]) => {
    setRows(prev => [...drafts, ...prev]);
  };

  // After a successful save from the list page, sync savedCount.
  const handleSaved = (count: number) => {
    setSavedCount(count);
  };

  // Refresh: re-fetch from server, replacing local rows (discard unsaved edits).
  const handleRefresh = useCallback(async () => {
    const data = await fetchQuestions();
    setRows(data.map(rowToDraft));
    setSavedCount(data.length);
  }, [fetchQuestions]);

  if (loading) {
    return <div className="qb-admin"><p>{t('admin.loading')}</p></div>;
  }

  return (
    <>
      {globalMsg && (
        <div className={'qb-msg ' + (globalMsg.type === 'ok' ? 'qb-msg-ok' : 'qb-msg-err')} style={{ margin: '16px auto', maxWidth: 1200 }}>
          {globalMsg.text}
        </div>
      )}
      {isAddRoute ? (
        <QuestionAdd onSave={handleAddFromAddPage} />
      ) : (
        <QuestionList
          rows={rows}
          setRows={setRows}
          pendingCount={pendingCount}
          onSaved={handleSaved}
          onRefresh={handleRefresh}
        />
      )}
    </>
  );
}
