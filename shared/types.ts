export type Pos = 'noun' | 'adj' | 'verb' | 'other';
export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'inst' | 'prep';
export type Num = 'sg' | 'pl';
export type Gender = 'm' | 'f' | 'n';
export type Level = 'A1' | 'A2' | 'B1';

/** lemma(id, text, pos, stress_text, gloss_pt, freq_rank, level) */
export interface Lemma {
  id: string;
  t: string; // texto sem acento
  s: string; // texto com U+0301
  pos: Pos;
  pt: string;
  en: string;
  r: number; // freq_rank
  lv: Level;
  g?: Gender;
  an?: 0 | 1; // animado
  gram: 0 | 1; // elegível para o exercício gerativo
  sgo?: 1;
  plo?: 1;
  asp?: 'impf' | 'pf';
}

/** form(id, lemma_id, form_text, form_stress, case, number, gender, tense, person, aspect, animacy) — v = variantes aceitas (1ª canônica) */
export interface Form {
  id: string;
  l: string;
  v: string[];
  c?: Case;
  n?: Num;
  g?: Gender;
  tn?: string;
  p?: string;
  as?: string;
  an?: 'anim' | 'inan';
}

/** token: [texto exibido, lemaId ('' = pontuação), espaçoAntes] */
export type Token = [string, string, 0 | 1];

/** sentence(id, ru, ru_stress, pt, source) */
export interface Sentence {
  id: string;
  ru: string; // com acento
  pt: string;
  src: string;
  tk: Token[];
  tx?: string;
}

export interface TextDoc {
  id: string;
  title: string;
  sentences: string[];
}

export interface Content {
  v: string;
  lemmas: Lemma[];
  forms: Form[];
  sentences: Sentence[];
  texts: TextDoc[];
  attributions: { name: string; license: string; url: string; note: string }[];
}
