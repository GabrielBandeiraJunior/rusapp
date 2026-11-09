// Apoio ao exercício de leitura de palavras: distratores plausíveis para a múltipla escolha de transliteração.
import { normalizeTranslit } from '../../shared/russian';

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

/** Hash determinístico e barato (escolha estável de modo/ordem por cartão). */
export function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
