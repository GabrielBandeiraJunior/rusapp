import { Card } from './ui';
import { Ru } from './Ru';

// Só preposições monossilábicas (não exigem acento). Não há formas flexionadas aqui — só quais preposições pedem cada caso.
const ROWS: { caso: string; items: { p: string; sentido: string }[] }[] = [
  {
    caso: 'Genitivo',
    items: [
      { p: 'без', sentido: 'sem' }, { p: 'для', sentido: 'para (finalidade)' }, { p: 'до', sentido: 'até' },
      { p: 'из', sentido: 'de dentro de' }, { p: 'от', sentido: 'de (afastamento)' }, { p: 'у', sentido: 'junto de; “ter”' },
      { p: 'с', sentido: 'de cima de; desde' },
    ],
  },
  { caso: 'Dativo', items: [{ p: 'к', sentido: 'em direção a' }, { p: 'по', sentido: 'por; ao longo de' }] },
  {
    caso: 'Acusativo',
    items: [
      { p: 'в', sentido: 'para dentro de (direção)' }, { p: 'на', sentido: 'para cima de (direção)' },
      { p: 'за', sentido: 'para trás de (direção)' }, { p: 'под', sentido: 'para baixo de (direção)' }, { p: 'про', sentido: 'sobre, a respeito de' },
    ],
  },
  {
    caso: 'Instrumental',
    items: [
      { p: 'с', sentido: 'com' }, { p: 'над', sentido: 'acima de' }, { p: 'под', sentido: 'embaixo de (lugar)' }, { p: 'за', sentido: 'atrás de (lugar)' },
    ],
  },
  {
    caso: 'Preposicional',
    items: [
      { p: 'в', sentido: 'em (lugar)' }, { p: 'на', sentido: 'sobre, em (lugar)' }, { p: 'о', sentido: 'sobre (assunto); об antes de vogal' },
      { p: 'при', sentido: 'junto a; sob' },
    ],
  },
];

export function CaseGuide() {
  return (
    <details className="mb-3 rounded-3xl border border-line/70 bg-surface" data-testid="case-guide">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">Quais preposições pedem qual caso?</summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-sm text-muted">
          Com <Ru>в</Ru>, <Ru>на</Ru>, <Ru>за</Ru> e <Ru>под</Ru> o caso depende da ideia: <b>movimento/direção</b> (“para onde?”) pede acusativo;
          <b> lugar</b> (“onde?”) pede preposicional (<Ru>в</Ru>, <Ru>на</Ru>) ou instrumental (<Ru>за</Ru>, <Ru>под</Ru>).
        </p>
        {ROWS.map((r) => (
          <Card key={r.caso} className="!p-3">
            <p className="mb-1 font-semibold">{r.caso}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {r.items.map((it) => (
                <li key={it.p + it.sentido}>
                  <Ru className="font-semibold">{it.p}</Ru> <span className="text-muted">{it.sentido}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <p className="text-xs text-muted">Preposições de duas ou mais sílabas (com acento) entram quando vierem dos dados.</p>
      </div>
    </details>
  );
}
