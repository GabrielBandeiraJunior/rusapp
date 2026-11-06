'use client';
import { lessonExamples, LESSONS } from '@/lib/lessons';
import type { GramFocus } from '@/lib/grammar';
import { useApp } from './Providers';
import { Ru } from './Ru';
import { Card } from './ui';

/** Mini-lição recolhível: o que o caso responde, quando usar e exemplos tirados dos dados. */
export function Lesson({ focus }: { focus: GramFocus }) {
  const { ix } = useApp();
  if (focus === 'all') return null;
  const def = LESSONS[focus];
  const ex = lessonExamples(ix, focus);
  return (
    <Card className="mb-3" data-testid="lesson">
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between font-bold">
          <span>Entenda o {def.title.toLowerCase()}</span>
          <span aria-hidden className="text-muted">▾</span>
        </summary>
        <p className="mt-1 text-sm"><b>Responde a:</b> {def.asks}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {def.uses.map((u) => <li key={u}>{u}</li>)}
        </ul>
        {ex.length > 0 && (
          <ul className="mt-3 space-y-1">
            {ex.map((e) => (
              <li key={e.pre + e.ru} className="text-lg">
                <Ru>{e.pre} {e.ru}</Ru> <span className="text-sm text-muted">({e.pt})</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </Card>
  );
}
