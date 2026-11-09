'use client';
import { useState } from 'react';
import { phonetic, sameAnswer, transliterate } from '../../../shared/russian';
import { useApp } from '../Providers';
import { Ru } from '../Ru';
import { TypeInput } from '../TypeInput';
import { Btn, Card } from '../ui';
import { ExampleLine, GENDER_LABEL, POS_PT, ResultBar, useFocus, type ExProps } from './shared';

/** Vocabulário: pt → ru digitando. */
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
        <p className="mb-1 text-base font-bold text-brand">{item.isNew ? 'Copie a palavra em russo' : 'Digite a palavra em russo'}</p>
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
