// Tatoeba (opcional): pares ru↔pt a partir dos dumps oficiais. Só entra o que resolve 100% nos dados (sem ambiguidade de acento).
import { closeSync, existsSync, openSync, readSync, rmSync } from 'node:fs';
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

const MAX_WORDS = 9;

function shortRows(tsv: string, maxWords: number): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of tsv.split('\n')) {
    const c = line.split('\t');
    if (c.length >= 3 && c[2].split(/\s+/).length <= maxWords) m.set(c[0], c[2]);
  }
  return m;
}

/**
 * Lê os dumps baixados por fetch.ts (precisa do utilitário `bzip2`); retorna [] se indisponível.
 * O arquivo de links tem centenas de milhões de linhas: é extraído para disco e lido em blocos
 * (só ficam em memória as frases curtas), senão estoura a memória do Node.
 */
export function loadTatoeba(dir = 'data/raw/tatoeba'): Pair[] {
  const f = (n: string) => `${dir}/${n}`;
  if (!['rus_sentences.tsv.bz2', 'por_sentences.tsv.bz2', 'links.tar.bz2'].every((n) => existsSync(f(n)))) return [];
  try {
    const sh = (args: string[]) => execFileSync(args[0], args.slice(1), { maxBuffer: 1 << 30 }).toString('utf8');
    const ru = shortRows(sh(['bzip2', '-dc', f('rus_sentences.tsv.bz2')]), MAX_WORDS);
    const pt = shortRows(sh(['bzip2', '-dc', f('por_sentences.tsv.bz2')]), 14);
    execFileSync('tar', ['-xjf', f('links.tar.bz2'), '-C', dir]);
    const links = f('links.csv');
    if (!existsSync(links)) return [];
    const out: Pair[] = [];
    const seen = new Set<string>();
    const fd = openSync(links, 'r');
    try {
      const buf = Buffer.alloc(32 << 20);
      let rest = '';
      for (;;) {
        const n = readSync(fd, buf, 0, buf.length, null);
        if (n === 0) break;
        const lines = (rest + buf.toString('utf8', 0, n)).split('\n');
        rest = lines.pop() ?? '';
        for (const l of lines) {
          const t = l.indexOf('\t');
          if (t < 0) continue;
          const a = l.slice(0, t), b = l.slice(t + 1).trim();
          if (ru.has(a) && pt.has(b) && !seen.has(a)) {
            seen.add(a);
            out.push({ id: a, ru: ru.get(a)!, pt: pt.get(b)! });
          }
        }
      }
    } finally {
      closeSync(fd);
      rmSync(links, { force: true }); // ~GBs: não deixar em disco
    }
    return out;
  } catch {
    return [];
  }
}
