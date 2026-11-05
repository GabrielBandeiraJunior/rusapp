'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isVowel, normalizeAnswer, normalizeTranslit, phonetic, sameAnswer, stressIndex, stripStress, transliterate, withStressAt } from '../../shared/russian';
import { exampleFor } from '@/lib/content';
import { answerFor, checkAnswer, explain, parseRef, promptFor } from '@/lib/grammar';
import type { QItem } from '@/lib/queue';
import { parseCardId } from '@/lib/srs';
import { useApp } from './Providers';
import { Ru } from './Ru';
import { TypeInput } from './TypeInput';
import { Btn, Card } from './ui';

export interface Outcome {
  rating: 1 | 2 | 3 | 4;
  correct: boolean;
  resp: string;
}
interface ExProps {
  item: QItem;
  onDone: (o: Outcome) => void;
}

const POS_PT = { noun: 'substantivo', adj: 'adjetivo', verb: 'verbo', other: 'palavra' } as const;
const GENDER_LABEL = { m: 'masc.', f: 'fem.', n: 'neutro' } as const;

function ResultBar({ ok, easyAllowed, onNext, children }: { ok: boolean; easyAllowed?: boolean; onNext: (easy: boolean) => void; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' });
    document.documentElement.dataset.result = ok ? 'ok' : 'bad'; // tinge o fundo da página inteira
    return () => {
      delete document.documentElement.dataset.result;
    };
  }, [ok]);
  return (
    <div ref={box} data-testid="result" className={`mt-3 rounded-2xl border-2 p-3 ${ok ? 'border-good' : 'border-bad'}`}>
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

function ExampleLine({ lemmaId }: { lemmaId: string }) {
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

function useFocus(dep: unknown) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [dep]);
  return ref;
}

// ---------------- Vocabulário: pt → ru digitando ----------------
export function VocabProdEx({ item, onDone }: ExProps) {
  const { ix } = useApp();
  const l = ix.lemma.get(item.ref)!;
  const [val, setVal] = useState('');
  const [hint, setHint] = useState(false);
  const [res, setRes] = useState<boolean | null>(null);
  const ref = useFocus(item.cardId);
  const submit = () => {
    if (!val.trim()) return;
    setRes(sameAnswer(val, l.t));
  };
  return (
    <div>
      {item.isNew && <p className="mb-2 inline-block rounded-full bg-brand/15 px-3 py-1 text-xs font-bold text-brand">NOVA PALAVRA</p>}
      <Card>
        <p className="text-sm text-muted">{POS_PT[l.pos]}{l.g ? ` · ${GENDER_LABEL[l.g]}` : ''}{l.asp ? ` · ${l.asp === 'pf' ? 'perfectivo' : 'imperfectivo'}` : ''}</p>
        <p className="mt-1 text-3xl font-bold" data-testid="prompt">{l.pt}</p>
        {item.isNew && (
          <p className="mt-3 text-4xl">
            <Ru data-testid="newword">{l.s}</Ru>
          </p>
        )}
        {hint && !item.isNew && (
          <p className="mt-2 text-lg text-muted">
            Começa com <Ru className="font-bold text-ink">{l.t[0]}</Ru> · {[...l.t].length} letras
          </p>
        )}
      </Card>
      <div className="mt-3">
        <TypeInput
          ref={ref}
          value={val}
          disabled={res !== null}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (res === null) submit(); } }}
          placeholder={item.isNew ? 'digite a palavra para fixar' : 'digite em russo'}
          aria-label="Resposta em russo"
        />
      </div>
      {res === null ? (
        <div className="mt-3 flex gap-2">
          {!item.isNew && (
            <Btn variant="ghost" onClick={() => setHint(true)} disabled={hint}>
              Dica
            </Btn>
          )}
          <Btn className="flex-1" onClick={submit} disabled={!val.trim()} data-testid="check">
            Verificar
          </Btn>
        </div>
      ) : (
        <ResultBar ok={res} easyAllowed={!hint && !item.isNew} onNext={(easy) => onDone({ rating: !res ? 1 : hint ? 2 : easy ? 4 : 3, correct: res, resp: val })}>
          <p className="text-3xl">
            <Ru data-testid="answer">{l.s}</Ru>
          </p>
          <p className="text-sm text-muted">leitura: {phonetic(l.s)} · {transliterate(l.t)}</p>
          <ExampleLine lemmaId={l.id} />
        </ResultBar>
      )}
    </div>
  );
}

// ---------------- Vocabulário: ru → pt (autoavaliação) ----------------
export function VocabRecEx({ item, onDone }: ExProps) {
  const { ix } = useApp();
  const l = ix.lemma.get(item.ref)!;
  const [show, setShow] = useState(false);
  const rate = (rating: 1 | 2 | 3 | 4) => onDone({ rating, correct: rating > 1, resp: '' });
  return (
    <div>
      <Card className="text-center">
        <p className="py-3 text-5xl">
          <Ru data-testid="prompt">{l.s}</Ru>
        </p>
        {show && (
          <div className="space-y-1 border-t border-line pt-3">
            <p className="text-2xl font-bold" data-testid="answer">{l.pt}</p>
            <p className="text-sm text-muted">{POS_PT[l.pos]} · leitura: {phonetic(l.s)}</p>
            <ExampleLine lemmaId={l.id} />
          </div>
        )}
      </Card>
      {!show ? (
        <Btn className="mt-3 w-full" onClick={() => setShow(true)} data-testid="show">
          Mostrar resposta
        </Btn>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2" data-testid="rate">
          <Btn variant="bad" onClick={() => rate(1)}>Errei</Btn>
          <Btn variant="warn" onClick={() => rate(2)}>Difícil</Btn>
          <Btn variant="good" onClick={() => rate(3)}>Acertei</Btn>
          <Btn variant="primary" onClick={() => rate(4)}>Fácil</Btn>
        </div>
      )}
    </div>
  );
}

// ---------------- Acento: toque na vogal tônica ----------------
export function StressEx({ item, onDone }: ExProps) {
  const { ix } = useApp();
  const l = ix.lemma.get(item.ref)!;
  const letters = useMemo(() => [...stripStress(l.s)], [l]);
  const target = stressIndex(l.s);
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div>
      <p className="mb-2 text-sm text-muted">Onde cai o acento? Toque na vogal tônica.</p>
      <Card>
        <p className="text-lg font-semibold">{l.pt}</p>
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
            <Ru data-testid="answer">{withStressAt(l.t, target) === l.s ? l.s : l.s}</Ru>
          </p>
          <ExampleLine lemmaId={l.id} />
        </ResultBar>
      )}
    </div>
  );
}

// ---------------- Gramática gerativa ----------------
export function GramEx({ item, onDone }: ExProps) {
  const { ix } = useApp();
  const key = useMemo(() => parseRef(item.ref), [item.ref]);
  const answers = answerFor(ix, key)!;
  const { lemma, line } = promptFor(ix, key);
  const [val, setVal] = useState('');
  const [res, setRes] = useState<boolean | null>(null);
  const ref = useFocus(item.cardId);
  const submit = () => val.trim() && setRes(checkAnswer(val, answers));
  const adj = lemma.pos === 'adj';
  return (
    <div>
      {item.isNew && <p className="mb-2 inline-block rounded-full bg-brand/15 px-3 py-1 text-xs font-bold text-brand">NOVO</p>}
      <Card>
        <p className="text-sm text-muted">{adj ? 'Escreva a forma do adjetivo' : 'Escreva a forma do substantivo'}</p>
        <p className="mt-1 text-4xl">
          <Ru data-testid="prompt">{lemma.s}</Ru>
        </p>
        <p className="text-lg text-muted">{lemma.pt}{lemma.g ? ` · ${GENDER_LABEL[lemma.g]}` : ''}{lemma.pos === 'noun' ? (lemma.an ? ' · animado' : ' · inanimado') : ''}</p>
        <p className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-lg font-bold text-brand" data-testid="target">→ {line}</p>
      </Card>
      <div className="mt-3">
        <TypeInput
          ref={ref}
          value={val}
          disabled={res !== null}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (res === null) submit(); } }}
          placeholder="digite a forma"
          aria-label="Forma em russo"
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
            {explain(ix, key, answers, res ? '' : val).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </ResultBar>
      )}
    </div>
  );
}

// ---------------- Leitura de palavras novas ----------------
const CONFUSE: [RegExp, string][] = [
  [/a/, 'o'], [/o/, 'a'], [/i/, 'y'], [/y/, 'i'], [/e/, 'i'], [/u/, 'o'], [/k/, 'g'], [/g/, 'k'], [/s/, 'z'], [/z/, 's'],
  [/t/, 'd'], [/d/, 't'], [/p/, 'b'], [/b/, 'p'], [/f/, 'v'], [/v/, 'f'], [/sh/, 'ch'], [/ch/, 'sh'], [/kh/, 'k'], [/zh/, 'z'], [/ts/, 's'], [/r/, 'l'], [/l/, 'r'], [/m/, 'n'], [/n/, 'm'],
];

export function distractors(correct: string, seed: number, n = 3): string[] {
  const out = new Set<string>();
  let i = seed;
  let guard = 0;
  while (out.size < n && guard++ < 200) {
    const [re, to] = CONFUSE[Math.abs(i++) % CONFUSE.length];
    const cand = correct.replace(re, to);
    if (cand !== correct && normalizeTranslit(cand) !== normalizeTranslit(correct)) out.add(cand);
  }
  return [...out];
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

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
  const title = { choose: 'Como se lê? Escolha a transliteração.', 'type-tr': 'Leia a palavra e digite a transliteração.', 'type-ru': 'Digite em russo a palavra transliterada.' }[mode];
  return (
    <div>
      <p className="mb-2 text-sm text-muted" data-testid="mode">{title}</p>
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

export function Exercise({ item, onDone }: ExProps) {
  const kind = parseCardId(item.cardId).kind;
  switch (kind) {
    case 'vprod': return <VocabProdEx item={item} onDone={onDone} />;
    case 'vrec': return <VocabRecEx item={item} onDone={onDone} />;
    case 'stress': return <StressEx item={item} onDone={onDone} />;
    case 'gram': return <GramEx item={item} onDone={onDone} />;
    case 'read': return <ReadEx item={item} onDone={onDone} />;
  }
}
