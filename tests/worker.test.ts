import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../src/lib/db';
import { syncOnce } from '../src/lib/sync';
import { makeWorker } from './helpers';

describe('Worker + D1 emulado (Miniflare)', () => {
  let w: Awaited<ReturnType<typeof makeWorker>>;
  beforeAll(async () => {
    w = await makeWorker();
  });
  afterAll(async () => {
    await w.mf.dispose();
  });

  const post = (body: unknown, token: string | null = 'secret-token', raw?: string) =>
    w.mf.dispatchFetch(`${w.base}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ?? JSON.stringify(body),
    });

  it('health é público; sync exige token (sem token / token errado → 401)', async () => {
    expect((await w.mf.dispatchFetch(`${w.base}/api/health`)).status).toBe(200);
    expect((await post({}, null)).status).toBe(401);
    expect((await post({}, 'errado')).status).toBe(401);
    expect((await post({})).status).toBe(200);
    expect((await w.mf.dispatchFetch(`${w.base}/api/sync`)).status).toBe(405);
  });

  it('CORS preflight', async () => {
    const r = await w.mf.dispatchFetch(`${w.base}/api/sync`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('corpo inválido nunca derruba o Worker (400/413/200, nunca 500)', async () => {
    expect((await post(null, 'secret-token', 'isto não é json')).status).toBe(400);
    expect((await post(null, 'secret-token', 'null')).status).toBe(400);
    expect((await post(null, 'secret-token', '[1,2]')).status).toBe(400);
    expect((await post({ reviews: 'x', settings: { a: 1 }, cursor: 5 })).status).toBe(200); // tipos errados são ignorados
    expect((await post({ reviews: [null, 7, { id: 'a' }], settings: [null, { key: 'x y', value: 'v', updated_at: 1 }] })).status).toBe(200);
    const big = await post(null, 'secret-token', JSON.stringify({ pad: 'x'.repeat(1_100_000) }));
    expect(big.status).toBe(413);
  });

  it('é idempotente por id de revisão e valida entradas', async () => {
    const rev = { id: 'x:1:0', card: 'vprod|n:дом', rating: 3, ts: 1000, resp: 'дом', correct: 1, dev: 'x' };
    await post({ reviews: [rev, rev, { ...rev, id: 'bad', rating: 9 }, { ...rev, id: 'frac', rating: 2.5 }] });
    await post({ reviews: [rev] });
    const n = await w.db.prepare('SELECT COUNT(*) AS n FROM review_log WHERE id IN (?1,?2,?3)').bind('x:1:0', 'bad', 'frac').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('configurações: last-writer-wins por timestamp; chaves inválidas são ignoradas', async () => {
    await post({ settings: [{ key: 'dailyGoal', value: '30', updated_at: 2000 }] });
    await post({ settings: [{ key: 'dailyGoal', value: '10', updated_at: 1000 }] }); // mais antigo → ignorado
    await post({ settings: [{ key: 'bad key!', value: '1', updated_at: 5 }] });
    const row = await w.db.prepare("SELECT value FROM setting WHERE key='dailyGoal'").first<{ value: string }>();
    expect(row?.value).toBe('30');
    expect(await w.db.prepare("SELECT 1 AS x FROM setting WHERE key='bad key!'").first()).toBeNull();
  });

  it('a migração 0002 removeu lembretes, cache de cartões e tabelas de conteúdo', async () => {
    const t = await w.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    const names = t.results.map((r) => r.name);
    for (const gone of ['reminder_log', 'card', 'lemma', 'form', 'sentence']) expect(names).not.toContain(gone);
    for (const kept of ['review_log', 'setting']) expect(names).toContain(kept);
  });

  it('dois aparelhos simulados convergem sem perder revisões (offline → reenvio)', async () => {
    const cfg = { url: w.base, token: 'secret-token' };
    const A = await Store.open('devA-' + Math.random());
    const B = await Store.open('devB-' + Math.random());
    const t0 = Date.UTC(2025, 5, 1, 12);
    // ambos estudam offline, inclusive o MESMO cartão
    await A.recordReview('vprod|n:дом', 3, true, 'дом', t0);
    await A.recordReview('vprod|n:дом', 1, false, 'дим', t0 + 5 * 60e3);
    await A.recordReview('gram|n:книга|gen|sg|-|-', 3, true, 'книги', t0 + 10 * 60e3);
    await B.recordReview('vprod|n:дом', 3, true, 'дом', t0 + 2 * 60e3);
    await B.recordReview('vprod|n:вода', 4, true, 'вода', t0 + 3 * 60e3);
    await B.setSetting('dailyGoal', '40', t0 + 60e3);
    await A.setSetting('dailyGoal', '25', t0 + 120e3); // A escreveu depois → vence

    // sync falha offline: nada se perde
    const down = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(syncOnce(A, cfg, down)).rejects.toThrow();
    expect((await A.unsyncedReviews()).length).toBe(3);

    await syncOnce(A, cfg, w.fetchImpl);
    await syncOnce(B, cfg, w.fetchImpl);
    await syncOnce(A, cfg, w.fetchImpl); // A recebe o que B enviou
    await syncOnce(B, cfg, w.fetchImpl);

    const ra = (await A.allReviews()).map((r) => r.id).sort();
    const rb = (await B.allReviews()).map((r) => r.id).sort();
    expect(ra).toEqual(rb);
    expect(ra).toContain('x:1:0'); // revisão de um teste anterior também chega (cursor local começa em 0)
    expect(ra.filter((id) => id !== 'x:1:0')).toHaveLength(5); // 3 de A + 2 de B, nada perdido
    // estado dos cartões idêntico nos dois aparelhos
    const ca = (await A.allCards()).sort((x, y) => (x.id < y.id ? -1 : 1));
    const cb = (await B.allCards()).sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(ca).toEqual(cb);
    expect(ca.find((c) => c.id === 'vprod|n:дом')?.fsrs.reps).toBe(4); // 2 de A + 1 de B + 1 do teste anterior
    expect(await A.getSetting('dailyGoal')).toBe('25');
    expect(await B.getSetting('dailyGoal')).toBe('25');
    expect((await A.unsyncedReviews()).length).toBe(0);
    const total = await w.db.prepare('SELECT COUNT(*) AS n FROM review_log WHERE device IN (?1,?2)').bind(A.deviceId, B.deviceId).first<{ n: number }>();
    expect(total?.n).toBe(5);
    A.close(); B.close();
  });

  it('paginação do pull (>500 revisões) converge', async () => {
    const cfg = { url: w.base, token: 'secret-token' };
    const A = await Store.open('big-' + Math.random());
    const C = await Store.open('big2-' + Math.random());
    const base = Date.UTC(2025, 6, 1);
    for (let i = 0; i < 650; i++) await A.recordReview(`vprod|n:c${i % 30}`, 3, true, '', base + i * 1000);
    await syncOnce(A, cfg, w.fetchImpl);
    await syncOnce(C, cfg, w.fetchImpl);
    const ids = new Set((await C.allReviews()).map((r) => r.id));
    for (const r of await A.allReviews()) expect(ids.has(r.id)).toBe(true);
    A.close(); C.close();
  });
});

describe('backup (exportar / importar)', () => {
  it('ida e volta entre aparelhos, mesclando sem duplicar', async () => {
    const A = await Store.open('bkA-' + Math.random());
    const B = await Store.open('bkB-' + Math.random());
    const t0 = Date.UTC(2025, 5, 1, 12);
    await A.recordReview('vprod|n:дом', 3, true, 'дом', t0);
    await A.recordReview('vprod|n:дом', 3, true, 'дом', t0 + 86400e3);
    await A.setSetting('dailyGoal', '33', t0);
    await B.recordReview('vprod|n:вода', 3, true, 'вода', t0);
    const file = JSON.parse(JSON.stringify(await A.exportBackup()));
    expect(file.app).toBe('rusapp');
    const r = await B.importBackup(file);
    expect(r).toEqual({ reviews: 2, settings: 1 });
    expect((await B.allReviews()).length).toBe(3);
    expect((await B.unsyncedReviews()).length).toBe(3); // as importadas sobem no próximo sync
    expect((await B.getCard('vprod|n:дом'))?.fsrs.reps).toBe(2);
    expect(await B.getSetting('dailyGoal')).toBe('33');
    expect(await B.importBackup(file)).toEqual({ reviews: 0, settings: 0 }); // idempotente
    await expect(B.importBackup({ app: 'outro' })).rejects.toThrow(/inválido/);
    A.close(); B.close();
  });
});
