'use client';
import { useMemo, useState } from 'react';
import { isVowel, stressIndex, stripStress } from '../../../shared/russian';
import { describeForm } from '@/lib/formlabel';
import { useApp } from '../Providers';
import { Ru } from '../Ru';
import { Card } from '../ui';
import { ExampleLine, ResultBar, type ExProps } from './shared';

/**
 * Acento: toque na vogal tônica. `ref` = id de lema (palavra-base) ou id de forma flexionada (contém "|"),
 * onde o acento costuma mudar de sílaba (a tônica de um substantivo muda entre singular e plural, por exemplo).
 */
export function StressEx({ item, onDone }: ExProps) {
  const { ix } = useApp();
  const form = item.ref.includes('|') ? ix.formById.get(item.ref) : undefined;
  const l = ix.lemma.get(form ? form.l : item.ref)!;
  const word = form ? form.v[0] : l.s;
  const letters = useMemo(() => [...stripStress(word)], [word]);
  const target = stressIndex(word);
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div>
      <p className="mb-2 text-base font-bold text-brand">Toque na vogal tônica</p>
      <Card>
        <p className="text-lg font-semibold">{l.pt}</p>
        {form && (
          <p className="text-sm text-muted" data-testid="form-label">
            forma de <Ru className="text-ink">{l.s}</Ru> · {describeForm(ix, form)}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-x-0.5 gap-y-2" data-testid="letters">
          {letters.map((ch, i) =>
            isVowel(ch) ? (
              <button
                key={i}
                disabled={pick !== null}
                onClick={() => setPick(i)}
                aria-label={`vogal ${ch}`}
                data-vowel={i}
                className={`ru min-h-12 min-w-12 rounded-lg border-2 text-3xl ${
                  pick === null ? 'border-brand/50 bg-brand/10' : i === target ? 'border-good bg-good/20' : i === pick ? 'border-bad bg-bad/20' : 'border-line'
                }`}
              >
                {ch}
              </button>
            ) : (
              <span key={i} lang="ru" className="ru px-0.5 text-3xl">{ch}</span>
            ),
          )}
        </div>
      </Card>
      {pick !== null && (
        <ResultBar ok={pick === target} onNext={() => onDone({ rating: pick === target ? 3 : 1, correct: pick === target, resp: String(pick) })}>
          <p className="text-3xl">
            <Ru data-testid="answer">{word}</Ru>
          </p>
          <ExampleLine lemmaId={l.id} />
        </ResultBar>
      )}
    </div>
  );
}
