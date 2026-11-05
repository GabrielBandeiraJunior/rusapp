'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { addDays, dayKey } from '../../shared/days';
import { useApp } from '@/components/Providers';
import { Bar, Card, Page } from '@/components/ui';
import { buildQueue } from '@/lib/queue';
import type { CardKind } from '@/lib/srs';
import { dueNow, errorsByCase, matureCount, retention, reviewsOnDay, streakFor } from '@/lib/stats';

const PLAN: { kind: CardKind; label: string; href: string }[] = [
  { kind: 'vprod', label: 'Vocabulário (digitar)', href: '/vocabulario/' },
  { kind: 'vrec', label: 'Vocabulário (reconhecer)', href: '/vocabulario/' },
  { kind: 'stress', label: 'Acento', href: '/vocabulario/' },
  { kind: 'gram', label: 'Casos (gramática)', href: '/gramatica/' },
  { kind: 'read', label: 'Leitura de palavras', href: '/alfabeto/' },
];

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
  const first = reviews.length === 0;
  const next = plan.find((p) => p.due + p.fresh > 0);

  return (
    <Page title="Hoje" right={<Link href="/config/" aria-label="Configurações" className="flex min-h-11 min-w-11 items-center justify-center text-2xl">⚙️</Link>}>
      {streak.atRisk && (
        <div role="alert" data-testid="streak-banner" className="mb-3 rounded-2xl bg-warn/20 p-4 text-warn">
          <b>Ofensiva em risco!</b> Você tem {streak.streak} {streak.streak === 1 ? 'dia' : 'dias'} seguidos — estude hoje para mantê-la.
        </div>
      )}
      {due.length > 0 && (
        <div data-testid="due-banner" className="mb-3 rounded-2xl bg-brand/15 p-4">
          <b>{due.length} {due.length === 1 ? 'cartão devido' : 'cartões devidos'}</b> agora.
          {next && <Link href={next.href} className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white">Revisar agora</Link>}
        </div>
      )}
      {first && (
        <Card className="mb-3">
          <p className="font-bold">Bem-vindo!</p>
          <p className="mt-1 text-sm text-muted">Comece pelo alfabeto e pelas regras de leitura; depois aprenda palavras (digitando) e treine os casos. Tudo funciona offline.</p>
          <Link href="/alfabeto/" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white">Começar pelo alfabeto</Link>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
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
            <Link href={p.href} className="flex min-h-14 items-center justify-between rounded-2xl border border-line bg-surface px-4">
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
        <p className="mt-4 text-center text-xs text-muted" data-testid="sync-status">
          Sync: {syncStatus === 'ok' ? 'em dia' : syncStatus === 'syncing' ? 'sincronizando…' : syncStatus === 'error' ? 'pendente' : 'ativo'} {syncMessage}
        </p>
      )}
    </Page>
  );
}
