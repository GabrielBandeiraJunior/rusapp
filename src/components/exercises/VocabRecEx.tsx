'use client';
import { useState } from 'react';
import { phonetic } from '../../../shared/russian';
import { useApp } from '../Providers';
import { Ru } from '../Ru';
import { Btn, Card } from '../ui';
import { ExampleLine, POS_PT, type ExProps } from './shared';

/** Vocabulário: ru → pt (autoavaliação em 4 níveis). */
export function VocabRecEx({ item, onDone }: ExProps) {
  const { ix } = useApp();
  const l = ix.lemma.get(item.ref)!;
  const [show, setShow] = useState(false);
  const rate = (rating: 1 | 2 | 3 | 4) => onDone({ rating, correct: rating > 1, resp: '' });
  return (
    <div>
      <Card className="text-center">
        <p className="mb-1 text-base font-bold text-brand">O que significa?</p>
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
