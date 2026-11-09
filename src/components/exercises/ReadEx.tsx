'use client';
import { useMemo, useState } from 'react';
import { normalizeAnswer, normalizeTranslit, phonetic, transliterate } from '../../../shared/russian';
import { distractors, hash } from '@/lib/readex';
import { useApp } from '../Providers';
import { Ru } from '../Ru';
import { TypeInput } from '../TypeInput';
import { Btn, Card } from '../ui';
import { ResultBar, useFocus, type ExProps } from './shared';

/** Leitura de palavras novas: escolher / digitar a transliteração / digitar em cirílico (o modo alterna por cartão). */
export function ReadEx({ item, onDone }: ExProps) {
  const { ix, cards } = useApp();
  const l = ix.lemma.get(item.ref)!;
  const reps = cards.find((c) => c.id === item.cardId)?.fsrs.reps ?? 0;
  const mode = (['choose', 'type-tr', 'type-ru'] as const)[(hash(item.ref) + reps) % 3];
  const tr = transliterate(l.t);
  const options = useMemo(() => {
    const d = distractors(tr, hash(item.ref));
    const all = [tr, ...d];
    return all.sort((a, b) => hash(a + item.ref) - hash(b + item.ref));
  }, [tr, item.ref]);
  const [val, setVal] = useState('');
  const [res, setRes] = useState<boolean | null>(null);
  const [picked, setPicked] = useState('');
  const ref = useFocus(item.cardId + mode);
  const finish = (ok: boolean, resp: string) => {
    setRes(ok);
    setVal(resp);
  };
  const submit = () => {
    if (!val.trim()) return;
    finish(mode === 'type-tr' ? normalizeTranslit(val) === normalizeTranslit(tr) : normalizeAnswer(val) === normalizeAnswer(l.t), val);
  };
  const title = { choose: 'Escolha como se lê', 'type-tr': 'Digite a transliteração', 'type-ru': 'Digite em russo' }[mode];
  return (
    <div>
      <p className="mb-2 text-base font-bold text-brand" data-testid="mode">{title}</p>
      <Card className="text-center">
        {mode === 'type-ru' ? (
          <p className="py-3 text-4xl font-bold" data-testid="prompt">{tr}</p>
        ) : (
          <p className="py-3 text-5xl">
            <Ru data-testid="prompt">{l.s}</Ru>
          </p>
        )}
      </Card>
      {mode === 'choose' ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {options.map((o) => (
            <Btn
              key={o}
              variant="ghost"
              disabled={res !== null}
              className={`text-xl ${res !== null && o === tr ? '!border-good !bg-good/20' : ''} ${res !== null && picked === o && o !== tr ? '!border-bad !bg-bad/20' : ''}`}
              onClick={() => {
                setPicked(o);
                finish(o === tr, o);
              }}
            >
              {o}
            </Btn>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-3">
            <TypeInput
              ref={ref}
              cyrillic={mode === 'type-ru'}
              value={val}
              disabled={res !== null}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (res === null) submit(); } }}
              placeholder={mode === 'type-tr' ? 'ex.: moloko' : 'digite em cirílico'}
            />
          </div>
          {res === null && (
            <Btn className="mt-3 w-full" onClick={submit} disabled={!val.trim()} data-testid="check">
              Verificar
            </Btn>
          )}
        </>
      )}
      {res !== null && (
        <ResultBar ok={res} onNext={() => onDone({ rating: res ? 3 : 1, correct: res, resp: val || picked })}>
          <p className="text-3xl">
            <Ru data-testid="answer">{l.s}</Ru>
          </p>
          <p className="text-lg">{tr} <span className="text-sm text-muted">· pronúncia: {phonetic(l.s)}</span></p>
          <p className="text-sm text-muted">{l.pt}</p>
        </ResultBar>
      )}
    </div>
  );
}
