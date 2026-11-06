import type { Content, Form, Lemma, Sentence } from '../../shared/types';

export interface ContentIndex {
  content: Content;
  lemma: Map<string, Lemma>;
  formsOf: Map<string, Form[]>;
  sentencesOf: Map<string, Sentence[]>;
  sentence: Map<string, Sentence>;
  /** pares de aspecto [de, para] (public/data/verbpairs.json) */
  pairs: [string, string][];
}

export function indexContent(content: Content, pairs: [string, string][] = []): ContentIndex {
  const lemma = new Map(content.lemmas.map((l) => [l.id, l]));
  const formsOf = new Map<string, Form[]>();
  for (const f of content.forms) {
    const a = formsOf.get(f.l);
    if (a) a.push(f);
    else formsOf.set(f.l, [f]);
  }
  const sentencesOf = new Map<string, Sentence[]>();
  for (const s of content.sentences) {
    const seen = new Set<string>();
    for (const [, l] of s.tk) {
      if (!l || seen.has(l)) continue;
      seen.add(l);
      const a = sentencesOf.get(l);
      if (a) a.push(s);
      else sentencesOf.set(l, [s]);
    }
  }
  return { content, lemma, formsOf, sentencesOf, sentence: new Map(content.sentences.map((s) => [s.id, s])), pairs };
}

let cached: Promise<ContentIndex> | null = null;

export function loadContent(): Promise<ContentIndex> {
  if (!cached) {
    cached = fetch('/data/content.json')
      .then((r) => {
        if (!r.ok) throw new Error(`content HTTP ${r.status}`);
        return r.json() as Promise<Content>;
      })
      .then(async (c) => {
        const pairs = await fetch('/data/verbpairs.json').then((r) => (r.ok ? (r.json() as Promise<[string, string][]>) : [])).catch(() => []);
        return indexContent(c, pairs);
      })
      .catch((e) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}

/** Frase mais curta que contém o lema (para exemplos). */
export function exampleFor(ix: ContentIndex, lemmaId: string): Sentence | undefined {
  const list = ix.sentencesOf.get(lemmaId);
  if (!list?.length) return undefined;
  return [...list].sort((a, b) => a.tk.length - b.tk.length)[0];
}
