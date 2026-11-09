// Tatoeba (opcional): pares ru↔pt a partir dos dumps oficiais. Só entra o que resolve 100% nos dados (sem ambiguidade de acento).
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

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

const require_ = createRequire(import.meta.url);

/** Descomprime .bz2: usa o `bzip2` do sistema se existir; senão, o descompressor em JS (seek-bzip) — funciona no Windows. */
function bunzip(file: string): string {
  try {
    return execFileSync('bzip2', ['-dc', file], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
  } catch {
    const Bunzip = require_('seek-bzip') as { decode(b: Buffer): Buffer };
    return Bunzip.decode(readFileSync(file)).toString('utf8');
  }
}

/** Frase russa candidata: curta (≤ 9 palavras), só cirílico e pontuação simples. */
export function acceptRu(s: string): boolean {
  return s.split(/\s+/).length <= 9 && /^[Ѐ-ӿ\s.,!?;:«»"“”—–-]+$/.test(s);
}

function tsvMap(text: string, keep: (s: string) => boolean): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split('\n')) {
    const [id, , s] = line.split('\t');
    if (id && s && keep(s)) m.set(id, s);
  }
  return m;
}

/** Percorre os links (tar.bz2, centenas de MB) em streaming, sem carregar o arquivo na memória. */
function streamLinks(file: string, onLine: (a: string, b: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xjOf', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    tar.stderr.on('data', (d) => (err += String(d)));
    tar.on('error', reject);
    createInterface({ input: tar.stdout }).on('line', (l) => {
      const i = l.indexOf('\t');
      if (i > 0) onLine(l.slice(0, i), l.slice(i + 1));
    });
    tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar saiu com ${code}: ${err.split('\n')[0]}`))));
  });
}

/** Lê os dumps baixados por fetch.ts. Retorna [] se faltarem arquivos; erros de leitura são AVISADOS (não silenciados). */
export async function loadTatoeba(dir = 'data/raw/tatoeba'): Promise<Pair[]> {
  const f = (n: string) => `${dir}/${n}`;
  const names = ['rus_sentences.tsv.bz2', 'por_sentences.tsv.bz2', 'links.tar.bz2'];
  if (!names.every((n) => existsSync(f(n)))) {
    console.warn('[tatoeba] dumps ausentes — usando só as frases autorais');
    return [];
  }
  try {
    const ru = tsvMap(bunzip(f(names[0])), acceptRu);
    const pt = tsvMap(bunzip(f(names[1])), () => true);
    const seen = new Set<string>();
    const out: Pair[] = [];
    await streamLinks(f(names[2]), (a, b) => {
      if (ru.has(a) && pt.has(b) && !seen.has(a)) {
        seen.add(a);
        out.push({ id: a, ru: ru.get(a)!, pt: pt.get(b)! });
      }
    });
    // determinístico; prefere frases de ~6 palavras (curtas demais ensinam pouco, longas resolvem menos)
    const dist = (p: Pair) => Math.abs(p.ru.split(/\s+/).length - 6);
    out.sort((x, y) => dist(x) - dist(y) || Number(x.id) - Number(y.id));
    console.log(`[tatoeba] ${out.length} pares ru↔pt candidatos`);
    return out;
  } catch (e) {
    console.warn(`[tatoeba] falha ao ler os dumps (${String((e as Error).message ?? e).split('\n')[0]}) — usando só as frases autorais`);
    return [];
  }
}
