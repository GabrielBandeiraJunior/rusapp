// Cliente de sincronização: idempotente (por id de revisão), funciona offline e reenvia depois.
import type { Store } from './db';
import type { CardRec, ReviewRec } from './srs';

export interface SyncConfig {
  url: string; // base do Worker, ex.: https://rusapp.<conta>.workers.dev
  token: string;
}

export interface Cursor {
  r: number;
  c: number;
  s: number;
}

export interface SyncRequest {
  device: string;
  cursor: Cursor;
  reviews: Omit<ReviewRec, 'synced'>[];
  cards: { id: string; kind: string; ref: string; fsrs_state_json: string; due: number; updated_at: number }[];
  settings: { key: string; value: string; updated_at: number }[];
}

export interface SyncResponse {
  cursor: Cursor;
  reviews: Omit<ReviewRec, 'synced'>[];
  settings: { key: string; value: string; updated_at: number }[];
  more: boolean;
}

const BATCH = 400;

function strip(r: ReviewRec): Omit<ReviewRec, 'synced'> {
  const { synced: _s, ...rest } = r;
  void _s;
  return rest;
}

function cardPayload(c: CardRec) {
  return { id: c.id, kind: c.kind, ref: c.ref, fsrs_state_json: JSON.stringify(c.fsrs), due: c.due, updated_at: c.updatedAt };
}

export async function syncOnce(
  store: Store, cfg: SyncConfig, fetchImpl: typeof fetch = fetch,
): Promise<{ pushed: number; pulled: number }> {
  let pushed = 0, pulled = 0;
  let cursor = (await store.getMeta<Cursor>('cursor')) ?? { r: 0, c: 0, s: 0 };
  const base = cfg.url.replace(/\/+$/, '');
  for (let guard = 0; guard < 200; guard++) {
    const unsynced = (await store.unsyncedReviews()).sort((a, b) => a.ts - b.ts).slice(0, BATCH);
    const dirty = await store.dirtySettings();
    const cardIds = [...new Set(unsynced.map((r) => r.card))];
    const cards: CardRec[] = [];
    for (const id of cardIds) {
      const c = await store.getCard(id);
      if (c) cards.push(c);
    }
    const body: SyncRequest = {
      device: store.deviceId, cursor,
      reviews: unsynced.map(strip), cards: cards.map(cardPayload),
      settings: dirty.map((s) => ({ key: s.key, value: s.value, updated_at: s.updatedAt })),
    };
    const res = await fetchImpl(`${base}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`sync HTTP ${res.status}`);
    const data = (await res.json()) as SyncResponse;
    await store.markSynced(unsynced.map((r) => r.id));
    await store.clearDirty(dirty.map((s) => s.key), Object.fromEntries(dirty.map((s) => [s.key, s.updatedAt])));
    pushed += unsynced.length;
    pulled += await store.ingestRemote(data.reviews);
    await store.ingestSettings(data.settings.map((s) => ({ key: s.key, value: s.value, updatedAt: s.updated_at })));
    cursor = data.cursor;
    await store.setMeta('cursor', cursor);
    const moreLocal = (await store.unsyncedReviews()).length > 0;
    if (!data.more && !moreLocal) break;
  }
  return { pushed, pulled };
}
