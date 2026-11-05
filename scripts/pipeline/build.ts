// Etapas 2–4 — normalizar → filtrar → gerar arquivos estáticos + seed do D1.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  loadAdjectives, loadNouns, loadOthers, loadVerbs, readTsv, canon, type RawLemma, type RawForm,
} from './openrussian.ts';
import { fromApostrophe, normalizeAnswer, stripStress, wordHasRequiredStress } from '../../shared/russian.ts';
import type { Content, Form, Lemma, Level, Sentence, TextDoc, Token } from '../../shared/types.ts';

const RAW = 'data/raw/';
const PRONOMINAL = new Set(['мой', 'наш', 'твой', 'ваш', 'этот', 'тот', 'весь']);
/** Lemas cujos dados de origem têm plural suspeito para o exercício (ver DECISIONS.md). */
const NO_GRAM = new Set(['год']);
const posId = { noun: 'n', adj: 'a', verb: 'v', other: 'o' } as const;

export interface BuildReport {
  lemmas: number;
  byPos: Record<string, number>;
  forms: number;
  gramNouns: number;
  gramAdjs: number;
  sentences: number;
  texts: number;
  skippedLemmas: string[];
  rejectedSentences: string[];
  glossSource: Record<string, number>;
}

function stressOk(f: string) {
  return wordHasRequiredStress(f);
}

export function levelFor(rank: number): Level {
  return rank <= 150 ? 'A1' : rank <= 320 ? 'A2' : 'B1';
}

function lemmaGramOk(l: RawLemma): boolean {
  const has = (num: string, c: string, g?: string) =>
    l.forms.some((f) => f.number === num && f.case === c && (g ? f.gender === g : true) && f.variants.every(stressOk));
  if (NO_GRAM.has(l.bare)) return false;
  if (l.pos === 'noun') {
    if (l.indeclinable || !l.gender) return false;
    const nums = l.plOnly ? ['pl'] : l.sgOnly ? ['sg'] : ['sg', 'pl'];
    return nums.every((n) => ['nom', 'gen', 'acc'].every((c) => has(n, c)));
  }
  if (l.pos === 'adj') {
    if (PRONOMINAL.has(l.bare)) return false;
    return (['m', 'f', 'n'] as const).every((g) => ['nom', 'gen', 'acc'].every((c) => has('sg', c, g))) &&
      ['nom', 'gen', 'acc'].every((c) => has('pl', c));
  }
  return false;
}

/** Converte formas brutas do OpenRussian em linhas de `form`; resolve acusativo de adjetivos (animado=genitivo, inanimado=nominativo). */
function toForms(id: string, l: RawLemma): { forms: Form[]; gramOk: boolean } {
  const out: Form[] = [];
  let gramOk = lemmaGramOk(l);
  const keep = (f: RawForm) => f.variants.filter(stressOk);
  const find = (c: string, n: string, g?: string) =>
    l.forms.find((f) => f.case === c && f.number === n && f.gender === g);
  for (const f of l.forms) {
    const variants = keep(f);
    if (!variants.length) continue;
    const base: Form = { id: `${id}|${f.col}`, l: id, v: variants };
    if (f.case) base.c = f.case as Form['c'];
    if (f.number) base.n = f.number;
    if (f.gender) base.g = f.gender;
    if (f.tense) base.tn = f.tense;
    if (f.person) base.p = f.person;
    if (f.aspect) base.as = f.aspect === 'imperfective' ? 'impf' : 'pf';
    if (l.pos === 'noun') {
      base.an = l.animate ? 'anim' : 'inan';
      out.push(base);
    } else if (l.pos === 'adj' && f.case === 'acc' && (f.gender === 'm' || (f.number === 'pl' && !f.gender))) {
      const nomF = find('nom', f.number!, f.gender);
      const genF = find('gen', f.number!, f.gender);
      if (!nomF || !genF) { gramOk = false; continue; }
      const nomV = keep(nomF), genV = keep(genF);
      const ok = variants.every((v) => nomV.includes(v) || genV.includes(v));
      if (!ok) { gramOk = false; out.push(base); continue; }
      out.push({ ...base, id: `${base.id}|inan`, v: nomV, an: 'inan' });
      out.push({ ...base, id: `${base.id}|anim`, v: genV, an: 'anim' });
    } else out.push(base);
  }
  return { forms: out, gramOk };
}

function sqlq(v: unknown): string {
  if (v === undefined || v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

interface Cand { lemmaId: string; form: string; exact: boolean }

function buildIndex(raws: Map<string, RawLemma>): Map<string, Cand[]> {
  const idx = new Map<string, Cand[]>();
  for (const [id, l] of raws) {
    for (const [k, set] of l.index) {
      for (const f of set) {
        if (!stressOk(f)) continue;
        const arr = idx.get(k) ?? [];
        if (!arr.some((c) => c.lemmaId === id && c.form === f)) arr.push({ lemmaId: id, form: f, exact: f === l.stress });
        idx.set(k, arr);
      }
    }
  }
  return idx;
}

const WORD = /^([«"“(]*)([Ѐ-ӿ'’]+(?:-[Ѐ-ӿ'’]+)*)(=[a-z]:[Ѐ-ӿ]+)?([.,!?;:»"”)…]*)$/;

export interface ResolveResult { tokens?: Token[]; ru?: string; error?: string }

/** Resolve uma frase autoral em tokens acentuados USANDO SÓ o índice de formas dos dados. */
export function resolveSentence(
  text: string, idx: Map<string, Cand[]>, rank: Map<string, number>,
): ResolveResult {
  const tokens: Token[] = [];
  const pieces = text.trim().split(/\s+/);
  let first = true;
  for (const piece of pieces) {
    const m = piece.match(WORD);
    if (!m) {
      if (/^[—–\-]+$/.test(piece)) { tokens.push([piece, '', 1]); first = false; continue; }
      return { error: `token inválido: ${piece}` };
    }
    const [, lead, core, forced, trail] = m;
    if (lead) tokens.push([lead, '', tokens.length ? 1 : 0]);
    const key = normalizeAnswer(core.replace(/['’]/g, ''));
    let cands = idx.get(key);
    if (!cands) return { error: `palavra desconhecida: ${key}` };
    if (forced) cands = cands.filter((c) => c.lemmaId === forced.slice(1));
    if (core.includes("'") || core.includes('’')) {
      const wanted = fromApostrophe(core);
      if (!wanted) return { error: `acento malformado: ${core}` };
      const w = wanted.replace(/ё/g, 'е');
      cands = cands.filter((c) => c.form.replace(/ё/g, 'е') === w);
    }
    if (core.includes('ё')) cands = cands.filter((c) => c.form.includes('ё'));
    const forms = [...new Set(cands.map((c) => c.form))];
    if (forms.length === 0) return { error: `sem candidato para ${core}${forced ?? ''}` };
    if (forms.length > 1) return { error: `acento ambíguo para ${key}: ${forms.join(' | ')} (marque com apóstrofo)` };
    let form = forms[0];
    const lemma = cands.filter((c) => c.form === form).sort((a, b) => Number(b.exact) - Number(a.exact) || (rank.get(a.lemmaId) ?? 1e9) - (rank.get(b.lemmaId) ?? 1e9))[0].lemmaId;
    const firstChar = [...core][0];
    if (firstChar !== firstChar.toLowerCase()) form = form[0].toUpperCase() + form.slice(1);
    tokens.push([form, lemma, lead || first ? (lead ? 0 : first ? 0 : 1) : 1]);
    if (trail) tokens.push([trail, '', 0]);
    first = false;
  }
  tokens.forEach((t, i) => { if (i === 0) t[2] = 0; });
  const ru = tokens.map((t, i) => (i && t[2] ? ' ' : '') + t[0]).join('');
  return { tokens, ru };
}

export function build(): BuildReport {
  const nouns = loadNouns(RAW + 'nouns.csv');
  const adjs = loadAdjectives(RAW + 'adjectives.csv');
  const verbs = loadVerbs(RAW + 'verbs.csv');
  const others = loadOthers(RAW + 'others.csv');
  const all = [...nouns, ...adjs, ...verbs, ...others];

  // frequência (OpenSubtitles) — formas somadas por lema
  const freq = new Map<string, number>();
  for (const line of readFileSync(RAW + 'ru_50k.txt', 'utf8').split('\n')) {
    const [w, c] = line.split(' ');
    if (!w) continue;
    const k = normalizeAnswer(w);
    freq.set(k, (freq.get(k) ?? 0) + Number(c));
  }
  const score = (l: RawLemma) => { let s = 0; for (const k of l.index.keys()) s += freq.get(k) ?? 0; return s; };

  const byBare = new Map<string, RawLemma[]>();
  for (const l of all) {
    const k = l.pos + ':' + normalizeAnswer(l.bare);
    byBare.set(k, [...(byBare.get(k) ?? []), l]);
  }
  const byAny = new Map<string, RawLemma[]>();
  for (const l of all) byAny.set(normalizeAnswer(l.bare), [...(byAny.get(normalizeAnswer(l.bare)) ?? []), l]);

  const skipped: string[] = [];
  const chosen: { raw: RawLemma; pt: string; score: number }[] = [];
  const seen = new Set<string>();
  for (const row of readTsv('data/curated/lemmas.tsv')) {
    const pos = row.pos as RawLemma['pos'];
    let cands = byBare.get(pos + ':' + normalizeAnswer(row.bare)) ?? [];
    if (!cands.length) cands = byAny.get(normalizeAnswer(row.bare)) ?? [];
    if (row.hint) cands = cands.filter((c) => c.en.toLowerCase().includes(row.hint.toLowerCase()));
    cands = cands.filter((c) => c.en && stressOk(c.stress));
    // preferir a mesma classe de palavra e a que tem formas completas/maior frequência
    cands.sort((a, b) => Number(b.pos === pos) - Number(a.pos === pos) || Number(lemmaGramOk(b)) - Number(lemmaGramOk(a)) || score(b) - score(a));
    const pick = cands[0];
    if (!pick) { skipped.push(`${row.pos}:${row.bare} — não encontrado/sem acento`); continue; }
    const key = pick.pos + ':' + pick.bare;
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push({ raw: pick, pt: row.pt, score: score(pick) });
  }
  chosen.sort((a, b) => b.score - a.score || a.raw.bare.localeCompare(b.raw.bare));

  const lemmas: Lemma[] = [];
  const forms: Form[] = [];
  const raws = new Map<string, RawLemma>();
  const rank = new Map<string, number>();
  let gramNouns = 0, gramAdjs = 0;
  chosen.forEach((c, i) => {
    const l = c.raw;
    const id = `${posId[l.pos]}:${l.bare}`; // id estável (pos:lema)
    const { forms: fs, gramOk } = toForms(id, l);
    const noForms = l.pos === 'adj' && l.forms.length === 0;
    const lem: Lemma = {
      id, t: stripStress(l.stress), s: l.stress, pos: noForms ? 'other' : l.pos, pt: c.pt, en: l.en.split(/\s*;\s*/)[0],
      r: i + 1, lv: levelFor(i + 1), gram: gramOk && (l.pos === 'noun' || l.pos === 'adj') ? 1 : 0,
    };
    if (l.gender) lem.g = l.gender;
    if (l.pos === 'noun') lem.an = l.animate ? 1 : 0;
    if (l.sgOnly) lem.sgo = 1;
    if (l.plOnly) lem.plo = 1;
    if (l.aspect) lem.asp = l.aspect === 'imperfective' ? 'impf' : 'pf';
    if (lem.gram && l.pos === 'noun') gramNouns++;
    if (lem.gram && l.pos === 'adj') gramAdjs++;
    lemmas.push(lem);
    forms.push(...fs);
    raws.set(id, l);
    rank.set(id, i + 1);
  });

  // frases autorais (Tatoeba indisponível neste ambiente → ver DECISIONS.md)
  const idx = buildIndex(raws);
  const rejected: string[] = [];
  const sentences: Sentence[] = [];
  const texts: TextDoc[] = [];
  const textTitles = new Map<string, string>();
  if (existsSync('data/curated/texts.tsv')) for (const r of readTsv('data/curated/texts.tsv')) textTitles.set(r.id, r.title);
  const sentRows = existsSync('data/curated/sentences.tsv') ? readTsv('data/curated/sentences.tsv') : [];
  sentRows.forEach((r, n) => {
    const res = resolveSentence(r.ru, idx, rank);
    if (!res.tokens) { rejected.push(`#${n + 2} "${r.ru}" — ${res.error}`); return; }
    const s: Sentence = { id: `s${String(sentences.length + 1).padStart(4, '0')}`, ru: res.ru!, pt: r.pt, src: 'autoral', tk: res.tokens };
    if (r.text && r.text !== '-') s.tx = r.text;
    sentences.push(s);
  });
  for (const [id, title] of textTitles) {
    const ss = sentences.filter((s) => s.tx === id).map((s) => s.id);
    if (ss.length >= 2) texts.push({ id, title, sentences: ss });
  }

  const attributions = [
    { name: 'OpenRussian.org (Badestrand/russian-dictionary)', license: 'CC BY-SA 4.0', url: 'https://github.com/Badestrand/russian-dictionary', note: 'Lemas, acentos, tabelas de flexão e glosas em inglês. Derivado do Wiktionary e contribuições da comunidade.' },
    { name: 'FrequencyWords (hermitdave) — OpenSubtitles 2018', license: 'CC BY-SA 4.0 (conteúdo) / MIT (código)', url: 'https://github.com/hermitdave/FrequencyWords', note: 'Ordenação por frequência.' },
    { name: 'Tatoeba', license: 'CC BY 2.0 FR', url: 'https://tatoeba.org', note: 'Reservado: usado apenas se o pipeline conseguir baixar os dumps (ver DECISIONS.md). Nesta versão as frases são autorais.' },
  ];

  const glossSource = { 'autor (pt)': lemmas.length };
  const content: Content = { v: '', lemmas, forms, sentences, texts, attributions };
  content.v = createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 10);
  mkdirSync('public/data', { recursive: true });
  writeFileSync('public/data/content.json', JSON.stringify(content));

  // seed do D1
  mkdirSync('worker/seed', { recursive: true });
  const sql: string[] = ['-- GERADO por scripts/pipeline (npm run data). Não editar à mão.', 'DELETE FROM sentence;', 'DELETE FROM form;', 'DELETE FROM lemma;'];
  for (const l of lemmas)
    sql.push(`INSERT INTO lemma(id,text,pos,stress_text,gloss_pt,freq_rank,level) VALUES(${sqlq(l.id)},${sqlq(l.t)},${sqlq(l.pos)},${sqlq(l.s)},${sqlq(l.pt)},${l.r},${sqlq(l.lv)});`);
  for (const f of forms)
    f.v.forEach((v, i) =>
      sql.push(`INSERT INTO form(id,lemma_id,form_text,form_stress,"case",number,gender,tense,person,aspect,animacy) VALUES(${sqlq(f.id + '#' + i)},${sqlq(f.l)},${sqlq(stripStress(v))},${sqlq(v)},${sqlq(f.c)},${sqlq(f.n)},${sqlq(f.g)},${sqlq(f.tn)},${sqlq(f.p)},${sqlq(f.as)},${sqlq(f.an)});`));
  for (const s of sentences)
    sql.push(`INSERT INTO sentence(id,ru,ru_stress,pt,source) VALUES(${sqlq(s.id)},${sqlq(stripStress(s.ru))},${sqlq(s.ru)},${sqlq(s.pt)},${sqlq(s.src)});`);
  writeFileSync('worker/seed/content.sql', sql.join('\n') + '\n');

  const byPos: Record<string, number> = {};
  for (const l of lemmas) byPos[l.pos] = (byPos[l.pos] ?? 0) + 1;
  const report: BuildReport = {
    lemmas: lemmas.length, byPos, forms: forms.length, gramNouns, gramAdjs,
    sentences: sentences.length, texts: texts.length, skippedLemmas: skipped, rejectedSentences: rejected, glossSource,
  };
  mkdirSync('data/build', { recursive: true });
  writeFileSync('data/build/report.json', JSON.stringify(report, null, 2));
  // snapshot reproduzível das linhas de origem dos lemas escolhidos (fonte dos testes de aceite)
  writeSourceSubset(chosen.map((c) => c.raw));
  void canon;
  return report;
}

function writeSourceSubset(raws: RawLemma[]) {
  mkdirSync('data/source', { recursive: true });
  const files: [string, RawLemma['pos']][] = [['nouns', 'noun'], ['adjectives', 'adj'], ['verbs', 'verb'], ['others', 'other']];
  for (const [name, pos] of files) {
    const text = readFileSync(RAW + name + '.csv', 'utf8').replace(/\r/g, '').split('\n');
    const head = text[0];
    const want = new Set(raws.filter((r) => r.pos === pos).map((r) => r.line));
    const rows = text.filter((_, n) => want.has(n));
    writeFileSync(`data/source/${name}.tsv`, [head, ...rows].join('\n') + '\n');
  }
}
