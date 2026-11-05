import type { Sentence, TextDoc } from '../../shared/types';
import type { ContentIndex } from './content';

export interface Coverage {
  words: number;
  known: number;
  pct: number;
  unknown: string[];
}

export function coverageOf(sentences: Sentence[], known: Set<string>): Coverage {
  let words = 0, k = 0;
  const unknown = new Set<string>();
  for (const s of sentences) {
    for (const [, l] of s.tk) {
      if (!l) continue;
      words++;
      if (known.has(l)) k++;
      else unknown.add(l);
    }
  }
  return { words, known: k, pct: words ? Math.round((k / words) * 1000) / 10 : 0, unknown: [...unknown] };
}

export function textCoverage(ix: ContentIndex, t: TextDoc, known: Set<string>): Coverage {
  return coverageOf(t.sentences.map((id) => ix.sentence.get(id)!).filter(Boolean), known);
}

/** Faixa ideal de compreensão: 95–98 %. */
export function band(pct: number): 'ideal' | 'facil' | 'dificil' {
  return pct >= 95 && pct <= 98 ? 'ideal' : pct > 98 ? 'facil' : 'dificil';
}

/** Ordena textos pela distância ao centro da faixa ideal (96,5 %). */
export function rankTexts(ix: ContentIndex, known: Set<string>) {
  return ix.content.texts
    .map((t) => ({ t, cov: textCoverage(ix, t, known) }))
    .sort((a, b) => Math.abs(a.cov.pct - 96.5) - Math.abs(b.cov.pct - 96.5));
}
