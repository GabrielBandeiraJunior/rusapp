import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayKey } from '../shared/days';
import { Store } from '../src/lib/db';
import { syncOnce } from '../src/lib/sync';
import { decideReminder, reminderText } from '../worker/src/reminders';
import { makeWorker } from './helpers';

const TZ = 'America/Sao_Paulo';
const at = (day: string, hh: number, mm = 0) => Date.parse(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`);

describe('Worker + D1 emulado (Miniflare)', () => {
  let w: Awaited<ReturnType<typeof makeWorker>>;
  beforeAll(async () => {
    w = await makeWorker({ telegram: true });
  });
  afterAll(async () => {
    await w.mf.dispose();
  });

  const post = (body: unknown, token: string | null = 'secret-token') =>
    w.mf.dispatchFetch(`${w.base}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
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

  it('é idempotente por id de revisão e valida entradas', async () => {
    const rev = { id: 'x:1:0', card: 'vprod|n:дом', rating: 3, ts: 1000, resp: 'дом', correct: 1, dev: 'x' };
    await post({ reviews: [rev, rev, { ...rev, id: 'bad', rating: 9 }] });
    await post({ reviews: [rev] });
    const n = await w.db.prepare('SELECT COUNT(*) AS n FROM review_log WHERE id IN (?1,?2)').bind('x:1:0', 'bad').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('configurações: last-writer-wins por timestamp', async () => {
    await post({ settings: [{ key: 'dailyGoal', value: '30', updated_at: 2000 }] });
    await post({ settings: [{ key: 'dailyGoal', value: '10', updated_at: 1000 }] }); // mais antigo → ignorado
    const row = await w.db.prepare("SELECT value FROM setting WHERE key='dailyGoal'").first<{ value: string }>();
    expect(row?.value).toBe('30');
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
    // servidor tem tudo e o cartão derivado
    const total = await w.db.prepare("SELECT COUNT(*) AS n FROM review_log WHERE device IN (?1,?2)").bind(A.deviceId, B.deviceId).first<{ n: number }>();
    expect(total?.n).toBe(5);
    const card = await w.db.prepare("SELECT id FROM card WHERE id='vprod|n:вода'").first();
    expect(card).toBeTruthy();
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

  describe('lembretes via Telegram (API mockada)', () => {
    const day = '2025-08-10';
    const setSettings = async (kv: Record<string, string>) => {
      for (const [k, v] of Object.entries(kv))
        await w.db.prepare('INSERT INTO setting(key,value,updated_at,seq) VALUES(?1,?2,1,(SELECT COALESCE(MAX(seq),0)+1 FROM setting)) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v).run();
    };
    const tick = async (when: number) => {
      const wk = await w.mf.getWorker();
      await wk.scheduled({ scheduledTime: new Date(when), cron: '*/30 * * * *' } as never);
    };
    const telegram = () => w.calls.filter((c) => c.url.startsWith('https://api.telegram.org/botBOT:TOKEN/sendMessage'));

    it('desligado por padrão: não envia nada', async () => {
      w.calls.length = 0;
      await tick(at(day, 20));
      expect(telegram()).toHaveLength(0);
    });

    it('envia lembrete diário no horário; não repete; respeita máx. 2/dia e silêncio se já estudou', async () => {
      await setSettings({ remindEnabled: '1', remindTime: '19:00', tz: TZ, streakAlertHours: '3' });
      // ofensiva de 3 dias (07, 08, 09) para ativar o alerta de risco
      for (const d of ['2025-08-07', '2025-08-08', '2025-08-09'])
        await w.db.prepare('INSERT INTO review_log(id,card_id,rating,ts,response_text,correct,device,seq) VALUES(?1,?2,3,?3,"",1,"t",(SELECT COALESCE(MAX(seq),0)+1 FROM review_log))').bind('r' + d, 'vprod|n:x', at(d, 10)).run();
      w.calls.length = 0;
      await tick(at(day, 18, 30)); // antes do horário
      expect(telegram()).toHaveLength(0);
      await tick(at(day, 19, 0));
      expect(telegram()).toHaveLength(1);
      expect((telegram()[0].body as { chat_id: string }).chat_id).toBe('4242');
      await tick(at(day, 19, 30)); // já enviou o diário; ainda longe do alerta de ofensiva
      expect(telegram()).toHaveLength(1);
      await tick(at(day, 21, 0)); // janela do alerta de ofensiva (3 h antes da meia-noite)
      expect(telegram()).toHaveLength(2);
      expect(String((telegram()[1].body as { text: string }).text)).toMatch(/3/);
      await tick(at(day, 22, 0)); // limite de 2/dia
      expect(telegram()).toHaveLength(2);
    });

    it('não envia se já estudou hoje', async () => {
      const d2 = '2025-08-11';
      await w.db.prepare('INSERT INTO review_log(id,card_id,rating,ts,response_text,correct,device,seq) VALUES("today","vprod|n:x",3,?1,"",1,"t",(SELECT COALESCE(MAX(seq),0)+1 FROM review_log))').bind(at(d2, 9)).run();
      w.calls.length = 0;
      await tick(at(d2, 21, 30));
      expect(telegram()).toHaveLength(0);
    });
  });
});

describe('regras de lembrete (puras)', () => {
  const base = { tz: TZ, enabled: true, remindTime: '19:00', streakAlertHours: 3, freeze: false, dueCount: 5, sentToday: [] as ('daily' | 'streak')[] };
  it('textos variam entre dias e são pt-BR', () => {
    const set = new Set(Array.from({ length: 12 }, (_, i) => reminderText('daily', `2025-08-${10 + i}`, { due: 3, streak: 0 })));
    expect(set.size).toBeGreaterThan(2);
    expect(reminderText('streak', '2025-08-10', { due: 0, streak: 7 })).toMatch(/\d/);
  });
  it('sem ofensiva não há alerta de risco, só o diário', () => {
    const now = at('2025-08-10', 22);
    expect(decideReminder({ ...base, now, studyDays: [] })).toBe('daily');
    expect(decideReminder({ ...base, now, studyDays: [], enabled: false })).toBeNull();
    expect(dayKey(now, TZ)).toBe('2025-08-10');
  });
});
