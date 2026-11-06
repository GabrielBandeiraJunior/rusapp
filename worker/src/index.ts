// Worker da API: sync de revisões/configurações (D1) + lembretes opcionais via Telegram.
import { computeStreak, dayKey } from '../../shared/days';
import { decideReminder, reminderText, sendTelegram, type ReminderKind } from './reminders';

export interface Env {
  DB: D1Database;
  APP_TOKEN: string;
  ALLOWED_ORIGIN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

interface InReview { id: string; card: string; rating: number; ts: number; resp?: string; correct: number; dev?: string }
interface InCard { id: string; kind: string; ref: string; fsrs_state_json: string; due: number; updated_at: number }
interface InSetting { key: string; value: string; updated_at: number }
interface SyncBody {
  device?: string;
  cursor?: { r?: number; c?: number; s?: number };
  reviews?: InReview[];
  cards?: InCard[];
  settings?: InSetting[];
}

const PULL_LIMIT = 500;
const MAX_ITEMS = 1000;
const MAX_BODY = 1_000_000; // bytes
const RESUME_MAX = 4000; // sessão interrompida (setting 'resume') é maior que um ajuste comum

// Freio de tentativas inválidas por IP (memória do isolate; suficiente para uso pessoal).
const FAILS = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 20;
const LOCK_MS = 15 * 60e3;
function throttled(ip: string, now: number): boolean {
  const f = FAILS.get(ip);
  return !!f && f.n >= MAX_FAILS && now < f.until;
}
function noteFail(ip: string, now: number) {
  const f = FAILS.get(ip);
  if (!f || now >= f.until) FAILS.set(ip, { n: 1, until: now + LOCK_MS });
  else f.n++;
  if (FAILS.size > 500) for (const [k, v] of FAILS) if (now >= v.until) FAILS.delete(k);
}

function cors(env: Env): Record<string, string> {
  // Sem ALLOWED_ORIGIN configurado, nenhuma origem de navegador é liberada (nega por padrão).
  const origin: Record<string, string> = env.ALLOWED_ORIGIN ? { 'access-control-allow-origin': env.ALLOWED_ORIGIN } : {};
  return {
    ...origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
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

async function runBatch(db: D1Database, stmts: D1PreparedStatement[]) {
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

export async function handleSync(env: Env, body: SyncBody): Promise<Response> {
  const reviews = (body.reviews ?? []).slice(0, MAX_ITEMS);
  const cards = (body.cards ?? []).slice(0, MAX_ITEMS);
  const settings = (body.settings ?? []).slice(0, 100);
  const stmts: D1PreparedStatement[] = [];
  const db = env.DB;
  for (const r of reviews) {
    if (!isStr(r.id) || !isStr(r.card) || !isNum(r.ts) || !(r.rating >= 1 && r.rating <= 4)) continue;
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO review_log(id,card_id,rating,ts,response_text,correct,device,seq)
         VALUES(?1,?2,?3,?4,?5,?6,?7,(SELECT COALESCE(MAX(seq),0)+1 FROM review_log))`,
      ).bind(r.id, r.card, r.rating, r.ts, String(r.resp ?? '').slice(0, 200), r.correct ? 1 : 0, String(r.dev ?? '').slice(0, 32)),
    );
  }
  for (const c of cards) {
    if (!isStr(c.id) || !isStr(c.kind, 16) || !isStr(c.ref, 200) || !isNum(c.due) || !isNum(c.updated_at) || typeof c.fsrs_state_json !== 'string') continue;
    stmts.push(
      db.prepare(
        `INSERT INTO card(id,kind,ref_id,fsrs_state_json,due,updated_at,seq)
         VALUES(?1,?2,?3,?4,?5,?6,(SELECT COALESCE(MAX(seq),0)+1 FROM card))
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, ref_id=excluded.ref_id, fsrs_state_json=excluded.fsrs_state_json,
           due=excluded.due, updated_at=excluded.updated_at, seq=excluded.seq
         WHERE excluded.updated_at > card.updated_at`,
      ).bind(c.id, c.kind, c.ref, c.fsrs_state_json.slice(0, 2000), c.due, c.updated_at),
    );
  }
  for (const s of settings) {
    if (!isStr(s.key, 64) || typeof s.value !== 'string' || !isNum(s.updated_at)) continue;
    const limit = s.key === 'resume' ? RESUME_MAX : 500;
    stmts.push(
      db.prepare(
        `INSERT INTO setting(key,value,updated_at,seq) VALUES(?1,?2,?3,(SELECT COALESCE(MAX(seq),0)+1 FROM setting))
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, seq=excluded.seq
         WHERE excluded.updated_at > setting.updated_at`,
      ).bind(s.key, s.value.slice(0, limit), s.updated_at),
    );
  }
  if (stmts.length) await runBatch(db, stmts);

  const cur = { r: Number(body.cursor?.r) || 0, c: Number(body.cursor?.c) || 0, s: Number(body.cursor?.s) || 0 };
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
    cursor: { r: rRows.length ? rRows[rRows.length - 1].seq : cur.r, c: cur.c, s: sRows.length ? sRows[sRows.length - 1].seq : cur.s },
    reviews: rRows.map((r) => ({ id: r.id, card: r.card_id, rating: r.rating, ts: r.ts, resp: r.response_text ?? '', correct: r.correct, dev: r.device ?? '' })),
    settings: sRows.map((s) => ({ key: s.key, value: s.value, updated_at: s.updated_at })),
    more,
  });
}

export async function runReminders(env: Env, now: number, fetchImpl: typeof fetch = fetch): Promise<ReminderKind | null> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  const rows = await env.DB.prepare('SELECT key,value FROM setting').all<{ key: string; value: string }>();
  const s = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
  if (s.remindEnabled !== '1') return null; // desligado por padrão
  const tz = s.tz || 'America/Sao_Paulo';
  const day = dayKey(now, tz);
  const sent = await env.DB.prepare('SELECT kind FROM reminder_log WHERE day = ?1').bind(day).all<{ kind: ReminderKind }>();
  // buckets de 15 min (alinha com qualquer fuso real) dos últimos ~400 dias
  const since = now - 400 * 86400e3;
  const buckets = await env.DB.prepare('SELECT DISTINCT ts/900000 AS b FROM review_log WHERE ts >= ?1').bind(since).all<{ b: number }>();
  const studyDays = new Set(buckets.results.map((r) => dayKey(r.b * 900000 + 450000, tz)));
  const due = await env.DB.prepare('SELECT COUNT(*) AS n FROM card WHERE due <= ?1').bind(now).first<{ n: number }>();
  const freeze = s.freeze === '1';
  const kind = decideReminder({
    now, tz, enabled: true, remindTime: s.remindTime || '19:00', streakAlertHours: Number(s.streakAlertHours) || 3,
    freeze, studyDays, dueCount: due?.n ?? 0, sentToday: sent.results.map((r) => r.kind),
  });
  if (!kind) return null;
  const streak = computeStreak(studyDays, day, freeze).streak;
  const text = reminderText(kind, day, { due: due?.n ?? 0, streak });
  const ok = await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text, fetchImpl);
  if (!ok) return null;
  await env.DB.prepare('INSERT OR IGNORE INTO reminder_log(day,kind,sent_at) VALUES(?1,?2,?3)').bind(day, kind, now).run();
  return kind;
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname === '/api/health') return json(env, { ok: true });
    if (url.pathname === '/api/sync') {
      if (req.method !== 'POST') return json(env, { error: 'method not allowed' }, 405);
      if (!env.APP_TOKEN) return json(env, { error: 'server not configured' }, 500);
      const ip = req.headers.get('cf-connecting-ip') ?? 'local';
      const now = Date.now();
      if (throttled(ip, now)) return json(env, { error: 'too many attempts' }, 429);
      if (!authorized(req, env)) {
        noteFail(ip, now);
        return json(env, { error: 'unauthorized' }, 401);
      }
      if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return json(env, { error: 'payload too large' }, 413);
      let body: SyncBody;
      try {
        const text = await req.text();
        if (text.length > MAX_BODY) return json(env, { error: 'payload too large' }, 413);
        body = JSON.parse(text) as SyncBody;
      } catch {
        return json(env, { error: 'invalid json' }, 400);
      }
      return handleSync(env, body);
    }
    return json(env, { error: 'not found' }, 404);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runReminders(env, event.scheduledTime).then(() => undefined));
  },
};

export default worker;
