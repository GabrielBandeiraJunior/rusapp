'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { exampleFor } from '@/lib/content';
import type { QItem } from '@/lib/queue';
import { useApp } from '../Providers';
import { Ru } from '../Ru';
import { Btn } from '../ui';

export interface Outcome {
  rating: 1 | 2 | 3 | 4;
  correct: boolean;
  resp: string;
}
export interface ExProps {
  item: QItem;
  onDone: (o: Outcome) => void;
}

export const POS_PT = { noun: 'substantivo', adj: 'adjetivo', verb: 'verbo', other: 'palavra' } as const;
export const GENDER_LABEL = { m: 'masc.', f: 'fem.', n: 'neutro' } as const;

export function ResultBar({ ok, easyAllowed, onNext, children }: { ok: boolean; easyAllowed?: boolean; onNext: (easy: boolean) => void; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' });
    document.documentElement.dataset.result = ok ? 'ok' : 'bad'; // tinge o fundo da página inteira
    return () => {
      delete document.documentElement.dataset.result;
    };
  }, [ok]);
  return (
    <div ref={box} data-testid="result" role="status" aria-live="polite" className={`mt-3 rounded-2xl border-2 p-3 ${ok ? 'border-good' : 'border-bad'}`}>
      <p className={`mb-1 text-lg font-bold ${ok ? 'text-good' : 'text-bad'}`}>{ok ? 'Correto!' : 'Ainda não.'}</p>
      <div className="space-y-1 text-base">{children}</div>
      <div className="mt-3 flex gap-2">
        {ok && easyAllowed && (
          <Btn variant="ghost" className="flex-1" onClick={() => onNext(true)}>
            Fácil
          </Btn>
        )}
        <Btn className="flex-[2]" onClick={() => onNext(false)} autoFocus data-testid="next">
          Continuar
        </Btn>
      </div>
    </div>
  );
}

export function ExampleLine({ lemmaId }: { lemmaId: string }) {
  const { ix } = useApp();
  const s = exampleFor(ix, lemmaId);
  if (!s) return null;
  return (
    <p className="text-sm text-muted">
      <Ru className="text-base text-ink">{s.ru}</Ru>
      <br />
      {s.pt}
    </p>
  );
}

/** Dá foco ao campo quando `dep` muda (nova pergunta). */
export function useFocus(dep: unknown) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [dep]);
  return ref;
}
