'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadContent, type ContentIndex } from '@/lib/content';
import { Store } from '@/lib/db';
import { syncOnce, type SyncConfig } from '@/lib/sync';
import type { CardRec, ReviewRec } from '@/lib/srs';
import { loadSettings, saveSetting, type Settings } from '@/lib/stats';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

interface Ctx {
  store: Store;
  ix: ContentIndex;
  cards: CardRec[];
  reviews: ReviewRec[];
  settings: Settings;
  syncStatus: SyncStatus;
  syncMessage: string;
  review: (cardId: string, rating: 1 | 2 | 3 | 4, correct: boolean, resp?: string) => Promise<void>;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => Promise<void>;
  syncNow: () => Promise<void>;
  /** Guarda (ou limpa, com '') a sessão interrompida; sincroniza entre aparelhos. */
  setResume: (raw: string) => Promise<void>;
  getSyncConfig: () => SyncConfig | null;
  setSyncConfig: (c: SyncConfig | null) => void;
}

const AppCtx = createContext<Ctx | null>(null);
const SYNC_KEY = 'rusapp.sync';

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fora do provider');
  return c;
}

function readSync(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<{ store: Store; ix: ContentIndex } | null>(null);
  const [err, setErr] = useState('');
  const [cards, setCards] = useState<CardRec[]>([]);
  const [reviews, setReviews] = useState<ReviewRec[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('off');
  const [syncMessage, setSyncMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const failures = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRef = useRef<() => Promise<void>>(async () => undefined);

  const reload = useCallback(async (store: Store) => {
    const [c, r, s] = await Promise.all([store.allCards(), store.allReviews(), loadSettings(store)]);
    setCards(c);
    setReviews(r);
    setSettings(s);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [store, ix] = await Promise.all([Store.open(), loadContent()]);
        if (!alive) return;
        await reload(store);
        setBoot({ store, ix });
        if (readSync()) setSyncStatus('idle');
        // pede armazenamento persistente: reduz o risco de o navegador (iOS/Safari) apagar o progresso
        void navigator.storage?.persist?.().catch(() => undefined);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  const syncNow = useCallback(async () => {
    const cfg = readSync();
    if (!boot || !cfg || busy.current) return;
    busy.current = true;
    setSyncStatus('syncing');
    try {
      const r = await syncOnce(boot.store, cfg);
      await reload(boot.store);
      failures.current = 0;
      setSyncStatus('ok');
      setSyncMessage(`↑${r.pushed} ↓${r.pulled}`);
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage(navigator.onLine ? String((e as Error).message) : 'offline — será reenviado depois');
      // nova tentativa com espera crescente (30 s, 1 min, 2 min … máx. 15 min)
      failures.current += 1;
      if (retry.current) clearTimeout(retry.current);
      const wait = Math.min(15 * 60_000, 30_000 * 2 ** (failures.current - 1));
      retry.current = setTimeout(() => void syncRef.current(), wait);
    } finally {
      busy.current = false;
    }
  }, [boot, reload]);

  useEffect(() => {
    syncRef.current = syncNow;
  }, [syncNow]);
  useEffect(
    () => () => {
      if (retry.current) clearTimeout(retry.current);
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const scheduleSync = useCallback(() => {
    if (!readSync()) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), 2500);
  }, [syncNow]);

  useEffect(() => {
    if (!boot) return;
    const on = () => void syncNow();
    window.addEventListener('online', on);
    void syncNow();
    return () => window.removeEventListener('online', on);
  }, [boot, syncNow]);

  useEffect(() => {
    const t = settings?.theme ?? 'auto';
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [settings?.theme]);

  const value = useMemo<Ctx | null>(() => {
    if (!boot || !settings) return null;
    return {
      store: boot.store, ix: boot.ix, cards, reviews, settings, syncStatus, syncMessage,
      review: async (cardId, rating, correct, resp = '') => {
        await boot.store.recordReview(cardId, rating, correct, resp);
        await reload(boot.store);
        scheduleSync();
      },
      update: async (k, v) => {
        await saveSetting(boot.store, k, v);
        await reload(boot.store);
        scheduleSync();
      },
      syncNow,
      setResume: async (raw) => {
        await boot.store.setSetting('resume', raw);
        setSettings((s) => (s ? { ...s, resume: raw } : s));
        scheduleSync();
      },
      getSyncConfig: readSync,
      setSyncConfig: (c) => {
        try {
          if (c) localStorage.setItem(SYNC_KEY, JSON.stringify(c));
          else localStorage.removeItem(SYNC_KEY);
        } catch {
          /* storage indisponível */
        }
        setSyncStatus(c ? 'idle' : 'off');
      },
    };
  }, [boot, cards, reviews, settings, syncStatus, syncMessage, reload, scheduleSync, syncNow]);

  if (err)
    return (
      <div className="p-6">
        <p className="font-semibold text-bad">Não foi possível iniciar o app.</p>
        <p className="text-sm text-muted">{err}</p>
      </div>
    );
  if (!value) return <div className="p-6 text-muted" data-testid="loading">Carregando…</div>;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
