// Tatoeba (opcional): pares ru↔pt a partir dos dumps oficiais. Só entra o que resolve 100% nos dados (sem ambiguidade de acento).
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export interface Pair { id: string; ru: string; pt: string }

/** Cruza sentenças ru e pt pelos links (formato Tatoeba: id\tlang\ttext e id1\tid2). */
export function pairUp(rusTsv: string, porTsv: string, linksTsv: string): Pair[] {
  const rows = (t: string) => t.split('\n').filter(Boolean).map((l) => l.split('\t'));
  const ru = new Map(rows(rusTsv).map((r) => [r[0], r[2]]));
  const pt = new Map(rows(porTsv).map((r) => [r[0], r[2]]));
  const out: Pair[] = [];
  const seen = new Set<string>();
  for (const [a, b] of rows(linksTsv)) {
    if (ru.has(a) && pt.has(b) && !seen.has(a)) {
      seen.add(a);
      out.push({ id: a, ru: ru.get(a)!, pt: pt.get(b)! });
    }
  }
  return out;
}

/** Lê os dumps baixados por fetch.ts (precisa do utilitário `bzip2`); retorna [] se indisponível. */
export function loadTatoeba(dir = 'data/raw/tatoeba'): Pair[] {
  const f = (n: string) => `${dir}/${n}`;
  if (!['rus_sentences.tsv.bz2', 'por_sentences.tsv.bz2', 'links.tar.bz2'].every((n) => existsSync(f(n)))) return [];
  try {
    const sh = (args: string[]) => execFileSync(args[0], args.slice(1), { maxBuffer: 1 << 30 }).toString('utf8');
    const rus = sh(['bzip2', '-dc', f('rus_sentences.tsv.bz2')]);
    const por = sh(['bzip2', '-dc', f('por_sentences.tsv.bz2')]);
    const links = sh(['tar', '-xjOf', f('links.tar.bz2')]);
    return pairUp(rus, por, links);
  } catch {
    return [];
  }
}
