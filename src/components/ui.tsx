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
      className={`min-h-12 min-w-12 rounded-2xl px-4 text-base font-semibold tracking-tight shadow-sm transition active:scale-[0.98] active:opacity-90 disabled:opacity-40 disabled:shadow-none ${v} ${className}`}
    />
  );
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string; 'data-testid'?: string }) {
  return <div {...rest} className={`rounded-3xl border border-line/70 bg-surface p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] ${className}`}>{children}</div>;
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
    <main className="mx-auto w-full max-w-md px-3 pb-24 safe-top">
      <header className="flex min-h-12 items-center justify-between py-1">
        <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
        {right}
      </header>
      {children}
    </main>
  );
}

export function Tabs<T extends string>({
  value, onChange, items, scroll = false,
}: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[]; scroll?: boolean }) {
  return (
    <div role="tablist" className={`mb-3 flex gap-1 rounded-2xl bg-line/50 p-1 ${scroll ? 'overflow-x-auto' : ''}`}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition ${scroll ? 'shrink-0 px-3' : 'flex-1'} ${value === it.id ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
