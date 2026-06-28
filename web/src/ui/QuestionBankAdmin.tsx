// Question-bank admin — top-level router.
// #admin                             → QuestionList  (compact cards)
// #admin/questions                   → QuestionList
// #admin/questions/add               → QuestionAdd   (manual + image recognition)
// #admin/questions/edit/{id}         → QuestionEdit  (standalone edit page)

import React, { useCallback, useEffect, useState } from 'react';
import type { QuestionRow } from '@fkzz/shared';
import { useT } from '../i18n';
import QuestionList, { type DraftRow, rowToDraft } from './QuestionList';
import QuestionAdd from './QuestionAdd';
import QuestionEdit from './QuestionEdit';

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

/** Parse the hash into a route descriptor. */
function parseRoute(hash: string): { page: 'list' | 'add' | 'edit'; id?: string } {
  const clean = hash.replace(/^#\/?/, '');
  if (clean === 'admin/questions/add' || clean === 'admin/add') {
    return { page: 'add' };
  }
  const editMatch = clean.match(/admin\/questions\/edit\/(.+)/);
  if (editMatch) {
    return { page: 'edit', id: decodeURIComponent(editMatch[1]!) };
  }
  return { page: 'list' };
}

export default function QuestionBankAdmin() {
  const t = useT();
  const hash = useHashRoute();
  const route = parseRoute(hash);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedCount, setSavedCount] = useState(0);
  const [globalMsg, setGlobalMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchQuestions = useCallback(async (): Promise<QuestionRow[]> => {
    const res = await fetch('/admin/questions');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as QuestionRow[];
  }, []);

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

  const pendingCount = Math.max(0, rows.length - savedCount);

  const handleAddFromAddPage = (drafts: DraftRow[]) => {
    setRows(prev => [...drafts, ...prev]);
  };

  const handleSaved = (count: number) => {
    setSavedCount(count);
  };

  const handleRefresh = useCallback(async () => {
    const data = await fetchQuestions();
    setRows(data.map(rowToDraft));
    setSavedCount(data.length);
  }, [fetchQuestions]);

  if (loading) {
    return <div className="qb-admin"><p>{t('admin.loading')}</p></div>;
  }

  // Validate edit route: if the id doesn't match any row, fall back to list.
  if (route.page === 'edit' && !rows.some(r => r.id === route.id)) {
    window.location.hash = '#admin/questions';
    return null;
  }

  return (
    <>
      {globalMsg && (
        <div className={'qb-msg ' + (globalMsg.type === 'ok' ? 'qb-msg-ok' : 'qb-msg-err')} style={{ margin: '16px auto', maxWidth: 1200 }}>
          {globalMsg.text}
        </div>
      )}
      {route.page === 'add' ? (
        <QuestionAdd onSave={handleAddFromAddPage} />
      ) : route.page === 'edit' ? (
        <QuestionEdit questionId={route.id!} rows={rows} setRows={setRows} />
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
