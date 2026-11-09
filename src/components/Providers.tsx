'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadContent, type ContentIndex } from '@/lib/content';
import { Store } from '@/lib/db';
import { syncOnce, type SyncConfig } from '@/lib/sync';
import type { CardRec, ReviewRec } from '@/lib/srs';
import { loadSettings, saveSetting, type Settings } from '@/lib/stats';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

/** Dados do estudo. Muda a cada resposta — quem só precisa do estado do sync usa `useSync`. */
interface AppValue {
  store: Store;
  ix: ContentIndex;
  cards: CardRec[];
  reviews: ReviewRec[];
  settings: Settings;
  review: (cardId: string, rating: 1 | 2 | 3 | 4, correct: boolean, resp?: string) => Promise<void>;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => Promise<void>;
  /** Relê tudo do IndexedDB (depois de importar um backup). */
  reload: () => Promise<void>;
}

/** Estado e controle da sincronização (muda raramente, separado para não re-renderizar o app todo). */
interface SyncValue {
  syncStatus: SyncStatus;
  syncMessage: string;
  syncNow: () => Promise<void>;
  getSyncConfig: () => SyncConfig | null;
  setSyncConfig: (c: SyncConfig | null) => void;
}

const AppCtx = createContext<AppValue | null>(null);
const SyncCtx = createContext<SyncValue | null>(null);
const SYNC_KEY = 'rusapp.sync';

export function useApp(): AppValue {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fora do provider');
  return c;
}

export function useSync(): SyncValue {
  const c = useContext(SyncCtx);
  if (!c) throw new Error('useSync fora do provider');
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

function upsertCard(list: CardRec[], card: CardRec): CardRec[] {
  const i = list.findIndex((c) => c.id === card.id);
  if (i < 0) return [...list, card];
  const next = list.slice();
  next[i] = card;
  return next;
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
        // pede armazenamento persistente: reduz o risco de o navegador apagar o progresso por falta de uso
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
      if (r.pulled > 0) await reload(boot.store);
      else {
        // configurações podem ter vindo do outro aparelho
        const s = await loadSettings(boot.store);
        setSettings((prev) => (prev && JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
      }
      setSyncStatus('ok');
      setSyncMessage(`↑${r.pushed} ↓${r.pulled}`);
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage(navigator.onLine ? String((e as Error).message) : 'offline — será reenviado depois');
    } finally {
      busy.current = false;
    }
  }, [boot, reload]);

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
    return () => {
      window.removeEventListener('online', on);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [boot, syncNow]);

  const app = useMemo<AppValue | null>(() => {
    if (!boot || !settings) return null;
    const { store, ix } = boot;
    return {
      store, ix, cards, reviews, settings,
      review: async (cardId, rating, correct, resp = '') => {
        const { card, review } = await store.recordReview(cardId, rating, correct, resp);
        setCards((prev) => upsertCard(prev, card));
        setReviews((prev) => [...prev, review]);
        scheduleSync();
      },
      update: async (k, v) => {
        await saveSetting(store, k, v);
        setSettings(await loadSettings(store));
        scheduleSync();
      },
      reload: () => reload(store),
    };
  }, [boot, cards, reviews, settings, reload, scheduleSync]);

  const sync = useMemo<SyncValue>(
    () => ({
      syncStatus, syncMessage, syncNow,
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
    }),
    [syncStatus, syncMessage, syncNow],
  );

  if (err)
    return (
      <div className="p-6">
        <p className="font-semibold text-bad">Não foi possível iniciar o app.</p>
        <p className="text-sm text-muted">{err}</p>
      </div>
    );
  if (!app) return <div className="p-6 text-muted" data-testid="loading">Carregando…</div>;
  return (
    <AppCtx.Provider value={app}>
      <SyncCtx.Provider value={sync}>{children}</SyncCtx.Provider>
    </AppCtx.Provider>
  );
}
