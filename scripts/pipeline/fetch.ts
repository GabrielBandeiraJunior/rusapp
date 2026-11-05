// Etapa 1 — baixar. Idempotente: pula arquivos já presentes (use --refresh para refazer).
// Ordem de fontes pedida: Wiktextract → OpenRussian → Tatoeba → frequência. Registra o resultado em fetch-report.json.
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const RAW = 'data/raw';
const OR = 'https://raw.githubusercontent.com/Badestrand/russian-dictionary/master';
const FREQ = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master';

interface Job { name: string; url: string; file: string; required: boolean; headOnly?: boolean }

export const JOBS: Job[] = [
  // 1. Wiktextract/kaikki: apenas teste de disponibilidade (arquivo ~100MB; parser só é necessário se OpenRussian falhar).
  { name: 'wiktextract-ru', url: 'https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl', file: '', required: false, headOnly: true },
  // 2. OpenRussian
  ...['nouns', 'adjectives', 'verbs', 'others'].map((n) => ({ name: `openrussian-${n}`, url: `${OR}/${n}.csv`, file: `${n}.csv`, required: true })),
  { name: 'openrussian-license', url: `${OR}/LICENSE`, file: 'LICENSE-openrussian.txt', required: false },
  // 4. Frequência
  { name: 'freq-ru', url: `${FREQ}/content/2018/ru/ru_50k.txt`, file: 'ru_50k.txt', required: true },
  { name: 'freq-license', url: `${FREQ}/LICENSE`, file: 'LICENSE-freq.txt', required: false },
  { name: 'freq-readme', url: `${FREQ}/README.md`, file: 'README-freq.md', required: false },
  // 3. Tatoeba (opcional; se inacessível o build usa frases autorais)
  { name: 'tatoeba-rus', url: 'https://downloads.tatoeba.org/exports/per_language/rus/rus_sentences.tsv.bz2', file: 'tatoeba/rus_sentences.tsv.bz2', required: false },
  { name: 'tatoeba-por', url: 'https://downloads.tatoeba.org/exports/per_language/por/por_sentences.tsv.bz2', file: 'tatoeba/por_sentences.tsv.bz2', required: false },
  { name: 'tatoeba-links', url: 'https://downloads.tatoeba.org/exports/links.tar.bz2', file: 'tatoeba/links.tar.bz2', required: false },
];

export async function fetchAll(refresh = false, fetchImpl: typeof fetch = fetch) {
  mkdirSync(RAW, { recursive: true });
  const report: Record<string, unknown>[] = [];
  for (const j of JOBS) {
    const path = `${RAW}/${j.file}`;
    try {
      if (j.headOnly) {
        const r = await fetchImpl(j.url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
        report.push({ name: j.name, status: r.ok ? 'available' : `http-${r.status}` });
        continue;
      }
      if (!refresh && existsSync(path) && statSync(path).size > 0) {
        report.push({ name: j.name, status: 'cached', sha256: sha(path) });
        continue;
      }
      const r = await fetchImpl(j.url, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
      writeFileSync(path, Buffer.from(await r.arrayBuffer()));
      report.push({ name: j.name, status: 'downloaded', sha256: sha(path) });
    } catch (e) {
      report.push({ name: j.name, status: 'unavailable', error: String((e as Error).message ?? e) });
      if (j.required && !existsSync(path)) throw new Error(`fonte obrigatória indisponível: ${j.name} (${String(e)})`);
    }
  }
  writeFileSync(`${RAW}/fetch-report.json`, JSON.stringify(report, null, 2));
  return report;
}

function sha(p: string) {
  return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
}
