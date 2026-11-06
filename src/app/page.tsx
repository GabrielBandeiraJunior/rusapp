'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { addDays, dayKey } from '../../shared/days';
import { useApp } from '@/components/Providers';
import { Bar, Card, Page } from '@/components/ui';
import { errorItems } from '@/lib/errors';
import { buildQueue, knownLemmas } from '@/lib/queue';
import { continueHref, decodeSession, sessionLabel } from '@/lib/resume';
import { isLearned, type CardKind } from '@/lib/srs';
import { dueNow, errorsByCase, matureCount, retention, reviewsOnDay, streakFor } from '@/lib/stats';

const PLAN: { kind: CardKind; label: string; href: string }[] = [
  { kind: 'vprod', label: 'Vocabulário (digitar)', href: '/vocabulario/' },
  { kind: 'vrec', label: 'Vocabulário (reconhecer)', href: '/vocabulario/' },
  { kind: 'stress', label: 'Acento', href: '/vocabulario/' },
  { kind: 'gram', label: 'Casos (gramática)', href: '/gramatica/' },
  { kind: 'read', label: 'Leitura de palavras', href: '/alfabeto/' },
  { kind: 'cloze', label: 'Casos em frases', href: '/gramatica/' },
  { kind: 'conj', label: 'Verbos (conjugação)', href: '/verbos/' },
  { kind: 'aspect', label: 'Verbos (aspecto)', href: '/verbos/' },
];


const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const weekday = (key: string) => WD[new Date(`${key}T12:00:00Z`).getUTCDay()];

interface Step { id: string; title: string; hint: string; href: string; have: number; goal: number }

function Path({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => s.have < s.goal);
  return (
    <ol data-testid="path" className="relative">
      {steps.map((s, i) => {
        const done = s.have >= s.goal;
        const isCur = i === current;
        return (
          <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className={`absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 ${done ? 'bg-good/60' : 'bg-line'}`} />}
            <span
              aria-hidden
              className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-good text-white' : isCur ? 'bg-brand text-white ring-4 ring-brand/20' : 'bg-line text-muted'}`}
            >
              {done ? '✓' : i + 1}
            </span>
            <Link
              href={s.href}
              data-testid={isCur ? 'path-current' : undefined}
              className={`flex min-h-11 flex-1 flex-col justify-center rounded-2xl border px-3 py-2 ${isCur ? 'border-brand/40 bg-brand/10' : 'border-line/70 bg-surface'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <b className={done || isCur ? '' : 'text-muted'}>{s.title}</b>
                <span className="text-xs text-muted">{Math.min(s.have, s.goal)}/{s.goal}</span>
              </span>
              <span className="text-xs text-muted">{s.hint}</span>
              <Bar value={Math.min(s.have, s.goal)} max={s.goal} tone={done ? 'good' : 'brand'} />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export default function Home() {
  const { ix, cards, reviews, settings, syncStatus, syncMessage } = useApp();
  const now = Date.now();
  const today = dayKey(now, settings.tz);
  const streak = streakFor(reviews, now, settings);
  const doneToday = reviewsOnDay(reviews, today, settings.tz);
  const due = dueNow(cards, now);
  const ret = retention(reviews, now);
  const errs = errorsByCase(reviews).slice(0, 6);
  const plan = useMemo(
    () => PLAN.map((p) => {
      const q = buildQueue(ix, cards, reviews, p.kind, now, { newPerDay: settings.newPerDay, tz: settings.tz });
      const d = q.filter((x) => !x.isNew).length;
      return { ...p, due: d, fresh: q.length - d };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ix, cards, reviews, settings.newPerDay, settings.tz],
  );
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    return { d, n: reviewsOnDay(reviews, d, settings.tz) };
  });
  const maxWeek = Math.max(1, ...week.map((w) => w.n));
  const saved = useMemo(() => decodeSession(settings.resume), [settings.resume]);
  const learned = (k: CardKind) => cards.filter((c) => c.kind === k && isLearned(c)).length;
  const steps: Step[] = [
    { id: 'read', title: 'Alfabeto e leitura', hint: 'Letras, regras e leitura de palavras', href: '/alfabeto/', have: learned('read'), goal: 10 },
    { id: 'vprod', title: 'Primeiras palavras', hint: 'Digite as palavras em russo', href: '/vocabulario/', have: learned('vprod'), goal: 30 },
    { id: 'stress', title: 'Acento tônico', hint: 'Onde cai a tônica', href: '/vocabulario/', have: learned('stress'), goal: 20 },
    { id: 'vrec', title: 'Reconhecer palavras', hint: 'Do russo para o português', href: '/vocabulario/', have: learned('vrec'), goal: 20 },
    { id: 'gram', title: 'Casos', hint: 'Os seis casos, um por vez', href: '/gramatica/', have: learned('gram'), goal: 60 },
    { id: 'cloze', title: 'Casos em frases', hint: 'Complete frases com a forma certa', href: '/gramatica/', have: learned('cloze'), goal: 15 },
    { id: 'verbs', title: 'Verbos', hint: 'Conjugação, aspecto e movimento', href: '/verbos/', have: learned('conj') + learned('aspect'), goal: 30 },
    { id: 'texts', title: 'Leitura de textos', hint: 'Textos com as palavras que você já conhece', href: '/leitura/', have: knownLemmas(cards).size, goal: 60 },
  ];
  const calendar = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    return { d, n: reviewsOnDay(reviews, d, settings.tz) };
  });
  const first = reviews.length === 0;
  const errCount = useMemo(() => errorItems(reviews).length, [reviews]);

  // comemoração ao concluir uma etapa do caminho ou a meta do dia (cada marco só uma vez)
  const [party, setParty] = useState<string | null>(null);
  useEffect(() => {
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem('russo.celebrated') || '[]'));
      const fresh: string[] = [];
      for (const st of steps) if (st.have >= st.goal && !seen.has(`step:${st.id}`)) fresh.push(`step:${st.id}`);
      if (doneToday >= settings.dailyGoal && !seen.has(`goal:${today}`)) fresh.push(`goal:${today}`);
      if (!fresh.length) return;
      // primeira abertura com progresso antigo: marca sem festejar
      const old = seen.size === 0 && reviews.length > settings.dailyGoal * 2;
      localStorage.setItem('russo.celebrated', JSON.stringify([...seen, ...fresh].slice(-200)));
      if (!old) {
        const f = fresh[0];
        setParty(f.startsWith('goal:') ? 'Meta do dia batida!' : `Etapa concluída: ${steps.find((x) => `step:${x.id}` === f)?.title}`);
        if ('vibrate' in navigator) navigator.vibrate?.([40, 60, 40]);
        const t = setTimeout(() => setParty(null), 4500);
        return () => clearTimeout(t);
      }
    } catch {
      /* sem armazenamento: não festeja */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneToday, cards.length]);
  const next = plan.find((p) => p.due + p.fresh > 0);

  return (
    <Page title="Hoje" right={<Link href="/config/" aria-label="Configurações" className="flex min-h-11 min-w-11 items-center justify-center text-2xl">⚙️</Link>}>
      <Card className="mb-3" data-testid="streak-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Dias seguidos</p>
            <p className="text-4xl font-extrabold tracking-tight" data-testid="streak-days">🔥 {streak.streak}</p>
          </div>
          <p className="text-right text-xs text-muted">recorde {streak.longest}<br />{doneToday}/{settings.dailyGoal} hoje</p>
        </div>
        <ul className="mt-3 flex justify-between" aria-label="Últimos 7 dias">
          {calendar.map((c, i) => (
            <li key={c.d} className="flex flex-col items-center gap-1">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${c.n ? 'bg-good text-white' : i === 6 ? 'border-2 border-dashed border-brand text-brand' : 'bg-line text-muted'}`}
              >
                {c.n ? '✓' : ''}
              </span>
              <span className={`text-[11px] ${i === 6 ? 'font-bold text-brand' : 'text-muted'}`}>{weekday(c.d)}</span>
            </li>
          ))}
        </ul>
      </Card>
      {party && (
        <div role="status" data-testid="party" className="party-pop mb-3 rounded-3xl bg-good p-4 text-center font-bold text-white">
          <span aria-hidden className="block text-3xl">🎉</span>
          {party}
        </div>
      )}
      {errCount > 0 && (
        <Link href="/erros/" data-testid="errors-card" className="mb-3 flex min-h-12 items-center justify-between rounded-2xl border border-bad/40 bg-bad/10 px-4 py-2">
          <span><b>Meus erros</b> <span className="text-sm text-muted">· treine o que você errou por último</span></span>
          <span className="rounded-full bg-bad px-3 py-1 text-sm font-bold text-white">{errCount}</span>
        </Link>
      )}
      {saved && (
        <Link
          href={continueHref(saved)}
          data-testid="continue-card"
          className="mb-3 flex min-h-14 items-center justify-between gap-3 rounded-3xl bg-brand px-4 py-3 text-white shadow-sm"
        >
          <span>
            <span className="block text-xs opacity-80">Continuar de onde parou</span>
            <b>{sessionLabel(saved)}</b>
          </span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">{saved.idx}/{saved.queue.length} ▶</span>
        </Link>
      )}
      {streak.atRisk && (
        <div role="alert" data-testid="streak-banner" className="mb-3 rounded-2xl bg-warn/20 p-3 text-warn">
          <b>Ofensiva em risco!</b> Você tem {streak.streak} {streak.streak === 1 ? 'dia' : 'dias'} seguidos — estude hoje para mantê-la.
        </div>
      )}
      {due.length > 0 && (
        <div data-testid="due-banner" className="mb-3 rounded-2xl bg-brand/15 p-3">
          <b>{due.length} {due.length === 1 ? 'cartão devido' : 'cartões devidos'}</b> agora.
          {next && <Link href={next.href} className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-brand px-3 font-semibold text-white">Revisar agora</Link>}
        </div>
      )}
      {first && (
        <Card className="mb-3">
          <p className="font-bold">Bem-vindo!</p>
          <p className="mt-1 text-sm text-muted">Comece pelo alfabeto e pelas regras de leitura; depois aprenda palavras (digitando) e treine os casos. Tudo funciona offline.</p>
          <Link href="/alfabeto/" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-brand px-3 font-semibold text-white">Começar pelo alfabeto</Link>
        </Card>
      )}
      <h2 className="mb-2 mt-4 text-lg font-bold">Seu caminho</h2>
      <Path steps={steps} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-muted">Ofensiva</p>
          <p className="text-3xl font-bold" data-testid="streak">🔥 {streak.streak}</p>
          <p className="text-xs text-muted">recorde {streak.longest}{settings.freeze ? ` · ❄️ ${streak.freezes}` : ''}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Meta de hoje</p>
          <p className="text-3xl font-bold" data-testid="goal">{doneToday}<span className="text-lg text-muted">/{settings.dailyGoal}</span></p>
          <Bar value={doneToday} max={settings.dailyGoal} tone={doneToday >= settings.dailyGoal ? 'good' : 'brand'} />
        </Card>
        <Card>
          <p className="text-sm text-muted">Retenção (30 d)</p>
          <p className="text-3xl font-bold" data-testid="retention">{ret.pct === null ? '—' : `${ret.pct}%`}</p>
          <p className="text-xs text-muted">{ret.n} revisões</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Cartões</p>
          <p className="text-3xl font-bold">{cards.length}</p>
          <p className="text-xs text-muted">{matureCount(cards)} maduros</p>
        </Card>
      </div>

      <h2 className="mb-2 mt-5 text-lg font-bold">Plano de hoje</h2>
      <ul className="space-y-2">
        {plan.map((p) => (
          <li key={p.kind}>
            <Link href={p.href} className="flex min-h-12 items-center justify-between rounded-2xl border border-line bg-surface px-3">
              <span>{p.label}</span>
              <span className="text-sm text-muted">{p.due} rev. · {p.fresh} novos</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 mt-5 text-lg font-bold">Últimos 7 dias</h2>
      <Card>
        <div className="flex h-24 items-end gap-2" aria-label="Revisões por dia">
          {week.map((w) => (
            <div key={w.d} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (w.n / maxWeek) * 100)}%`, opacity: w.n ? 1 : 0.2 }} />
              <span className="text-[10px] text-muted">{w.d.slice(8)}</span>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="mb-2 mt-5 text-lg font-bold">Erros por caso</h2>
      <Card>
        {errs.length === 0 ? (
          <p className="text-sm text-muted">Sem dados ainda — faça exercícios de “Casos”.</p>
        ) : (
          <ul className="space-y-3" data-testid="errors">
            {errs.map((e) => (
              <li key={e.label}>
                <div className="flex justify-between text-sm"><span>{e.label}</span><span className="text-muted">{e.wrong}/{e.total} erros</span></div>
                <Bar value={e.wrong} max={e.total} tone="bad" />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {syncStatus !== 'off' && (
        <p className="mt-3 text-center text-xs text-muted" data-testid="sync-status">
          Sync: {syncStatus === 'ok' ? 'em dia' : syncStatus === 'syncing' ? 'sincronizando…' : syncStatus === 'error' ? 'pendente' : 'ativo'} {syncMessage}
        </p>
      )}
    </Page>
  );
}
