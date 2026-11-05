'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Btn({
  variant = 'primary', className = '', ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'good' | 'bad' | 'warn' }) {
  const v = {
    primary: 'bg-brand text-white',
    ghost: 'bg-surface text-ink border border-line',
    good: 'bg-good text-white',
    bad: 'bg-bad text-white',
    warn: 'bg-warn text-white',
  }[variant];
  return (
    <button
      {...p}
      className={`min-h-12 min-w-12 rounded-xl px-4 text-base font-semibold active:opacity-80 disabled:opacity-40 ${v} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</div>;
}

export function Bar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'good' | 'bad' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full ${{ brand: 'bg-brand', good: 'bg-good', bad: 'bg-bad' }[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Page({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-32 safe-top">
      <header className="flex min-h-14 items-center justify-between py-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        {right}
      </header>
      {children}
    </main>
  );
}

export function Tabs<T extends string>({
  value, onChange, items,
}: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 rounded-xl bg-line/60 p-1">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold ${value === it.id ? 'bg-surface shadow' : 'text-muted'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
