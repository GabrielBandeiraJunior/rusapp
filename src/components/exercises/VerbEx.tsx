'use client';
import { useMemo, useState } from 'react';
import { checkAnswer } from '@/lib/grammar';
import { explainVerb, parseVerbRef, promptVerb, verbAnswerFor } from '@/lib/verbs';
import { useApp } from '../Providers';
import { Ru } from '../Ru';
import { TypeInput } from '../TypeInput';
import { Btn, Card } from '../ui';
import { ResultBar, useFocus, type ExProps } from './shared';

/** Conjugação: digitar a forma verbal (presente/futuro, passado ou imperativo). */
export function VerbEx({ item, onDone }: ExProps) {
  const { ix } = useApp();
  const key = useMemo(() => parseVerbRef(item.ref), [item.ref]);
  const answers = verbAnswerFor(ix, key)!;
  const { lemma, tense, ru } = promptVerb(ix, key);
  const [val, setVal] = useState('');
  const [res, setRes] = useState<boolean | null>(null);
  const ref = useFocus(item.cardId);
  const submit = () => val.trim() && setRes(checkAnswer(val, answers));
  return (
    <div>
      {item.isNew && <p className="mb-2 inline-block rounded-full bg-brand/15 px-3 py-1 text-xs font-bold text-brand">NOVO</p>}
      <Card>
        <p className="mb-1 text-base font-bold text-brand">Digite a forma do verbo</p>
        <p className="mt-1 text-4xl">
          <Ru data-testid="prompt">{lemma.s}</Ru>
        </p>
        <p className="text-lg text-muted">{lemma.pt}{lemma.asp ? ` · ${lemma.asp === 'pf' ? 'perfectivo' : 'imperfectivo'}` : ''}</p>
        <p className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-lg font-bold text-brand" data-testid="target">
          → {tense} — <Ru>{ru}</Ru>
        </p>
      </Card>
      <div className="mt-3">
        <TypeInput
          ref={ref}
          value={val}
          disabled={res !== null}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (res === null) submit(); } }}
          placeholder="digite a forma"
          aria-label="Forma verbal em russo"
        />
      </div>
      {res === null ? (
        <Btn className="mt-3 w-full" onClick={submit} disabled={!val.trim()} data-testid="check">
          Verificar
        </Btn>
      ) : (
        <ResultBar ok={res} easyAllowed onNext={(easy) => onDone({ rating: !res ? 1 : easy ? 4 : 3, correct: res, resp: val })}>
          <p className="text-3xl">
            <Ru data-testid="answer">{answers[0]}</Ru>
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {explainVerb(ix, key, answers).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </ResultBar>
      )}
    </div>
  );
}
