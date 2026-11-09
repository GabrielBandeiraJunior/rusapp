// Worker da API: sincroniza revisões e configurações (D1). O estado dos cartões NÃO trafega:
// cada aparelho o recalcula por replay das revisões (ver DECISIONS.md #9).

export interface Env {
  DB: D1Database;
  APP_TOKEN: string;
  ALLOWED_ORIGIN?: string;
}

interface InReview { id: string; card: string; rating: number; ts: number; resp?: string; correct: number; dev?: string }
interface InSetting { key: string; value: string; updated_at: number }
interface SyncBody {
  device?: string;
  cursor?: { r?: number; s?: number };
  reviews?: InReview[];
  settings?: InSetting[];
}

const PULL_LIMIT = 500;
const MAX_REVIEWS = 1000;
const MAX_SETTINGS = 100;
const MAX_BODY = 1_000_000; // bytes
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function cors(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(env: Env, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(env) } });
}

/** Comparação em tempo constante. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function authorized(req: Request, env: Env): boolean {
  if (!env.APP_TOKEN) return false;
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer (.+)$/);
  return !!m && safeEqual(m[1], env.APP_TOKEN);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max = 256): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = <T>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v.slice(0, max) as T[]) : []);

async function runBatch(db: D1Database, stmts: D1PreparedStatement[]) {
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

export async function handleSync(env: Env, body: SyncBody): Promise<Response> {
  const reviews = list<InReview>(body.reviews, MAX_REVIEWS);
  const settings = list<InSetting>(body.settings, MAX_SETTINGS);
  const stmts: D1PreparedStatement[] = [];
  const db = env.DB;
  for (const r of reviews) {
    if (!isObj(r) || !isStr(r.id) || !isStr(r.card) || !isNum(r.ts) || !Number.isInteger(r.rating) || !(r.rating >= 1 && r.rating <= 4)) continue;
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO review_log(id,card_id,rating,ts,response_text,correct,device,seq)
         VALUES(?1,?2,?3,?4,?5,?6,?7,(SELECT COALESCE(MAX(seq),0)+1 FROM review_log))`,
      ).bind(r.id, r.card, r.rating, r.ts, String(r.resp ?? '').slice(0, 200), r.correct ? 1 : 0, String(r.dev ?? '').slice(0, 32)),
    );
  }
  for (const s of settings) {
    if (!isObj(s) || !isStr(s.key, 64) || !KEY_RE.test(s.key) || typeof s.value !== 'string' || !isNum(s.updated_at)) continue;
    stmts.push(
      db.prepare(
        `INSERT INTO setting(key,value,updated_at,seq) VALUES(?1,?2,?3,(SELECT COALESCE(MAX(seq),0)+1 FROM setting))
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, seq=excluded.seq
         WHERE excluded.updated_at > setting.updated_at`,
      ).bind(s.key, s.value.slice(0, 500), s.updated_at),
    );
  }
  if (stmts.length) await runBatch(db, stmts);

  const cur = { r: Number(body.cursor?.r) || 0, s: Number(body.cursor?.s) || 0 };
  const rv = await db
    .prepare('SELECT id,card_id,rating,ts,response_text,correct,device,seq FROM review_log WHERE seq > ?1 ORDER BY seq LIMIT ?2')
    .bind(cur.r, PULL_LIMIT + 1)
    .all<{ id: string; card_id: string; rating: number; ts: number; response_text: string; correct: number; device: string; seq: number }>();
  const sv = await db
    .prepare('SELECT key,value,updated_at,seq FROM setting WHERE seq > ?1 ORDER BY seq LIMIT ?2')
    .bind(cur.s, PULL_LIMIT + 1)
    .all<{ key: string; value: string; updated_at: number; seq: number }>();
  const rRows = rv.results.slice(0, PULL_LIMIT);
  const sRows = sv.results.slice(0, PULL_LIMIT);
  const more = rv.results.length > PULL_LIMIT || sv.results.length > PULL_LIMIT;
  return json(env, {
    cursor: { r: rRows.length ? rRows[rRows.length - 1].seq : cur.r, s: sRows.length ? sRows[sRows.length - 1].seq : cur.s },
    reviews: rRows.map((r) => ({ id: r.id, card: r.card_id, rating: r.rating, ts: r.ts, resp: r.response_text ?? '', correct: r.correct, dev: r.device ?? '' })),
    settings: sRows.map((s) => ({ key: s.key, value: s.value, updated_at: s.updated_at })),
    more,
  });
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
      if (url.pathname === '/api/health') return json(env, { ok: true });
      if (url.pathname === '/api/sync') {
        if (req.method !== 'POST') return json(env, { error: 'method not allowed' }, 405);
        if (!env.APP_TOKEN) return json(env, { error: 'server not configured' }, 500);
        if (!authorized(req, env)) return json(env, { error: 'unauthorized' }, 401);
        const declared = Number(req.headers.get('content-length') ?? 0);
        if (declared > MAX_BODY) return json(env, { error: 'payload too large' }, 413);
        const text = await req.text();
        if (text.length > MAX_BODY) return json(env, { error: 'payload too large' }, 413);
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return json(env, { error: 'invalid json' }, 400);
        }
        if (!isObj(body)) return json(env, { error: 'invalid body' }, 400);
        return await handleSync(env, body as SyncBody);
      }
      return json(env, { error: 'not found' }, 404);
    } catch (e) {
      console.error('worker error', e);
      return json(env, { error: 'internal error' }, 500);
    }
  },
};

export default worker;
