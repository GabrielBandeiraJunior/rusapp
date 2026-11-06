// Mini-lições de caso. O texto explica o USO; os exemplos em russo vêm SEMPRE das formas dos dados (acento garantido).
import type { Case } from '../../shared/types';
import type { ContentIndex } from './content';
import { answerFor, type GramFocus } from './grammar';

export interface LessonDef {
  title: string;
  asks: string; // pergunta que o caso responde
  uses: string[];
  /** [preposição/palavra curta, lema] — a forma vem dos dados */
  examples: [string, string][];
}

export const LESSONS: Record<Exclude<GramFocus, 'all'>, LessonDef> = {
  nom: {
    title: 'Nominativo',
    asks: 'Quem? O quê?',
    uses: ['É a forma do dicionário.', 'Sujeito da frase.', 'Nas frases de identificação: «isto é uma casa».'],
    examples: [['это', 'n:дом'], ['это', 'n:книга'], ['это', 'n:друг']],
  },
  acc: {
    title: 'Acusativo',
    asks: 'Quem? O quê? (objeto direto) · Para onde?',
    uses: ['Objeto direto do verbo («vejo a casa»).', 'Direção, com в/на («vou para a escola»).', 'Masculino animado: acusativo = genitivo.'],
    examples: [['в', 'n:школа'], ['на', 'n:работа'], ['в', 'n:магазин']],
  },
  gen: {
    title: 'Genitivo',
    asks: 'De quem? De quê?',
    uses: ['Posse e relação («a casa do amigo»).', 'Ausência: «нет» + genitivo.', 'Depois de у, для, из, от, без, до.', 'Depois de números 2–4 (singular) e 5+ (plural).'],
    examples: [['у', 'n:друг'], ['для', 'n:мама'], ['из', 'n:город']],
  },
  dat: {
    title: 'Dativo',
    asks: 'Para quem? A quem?',
    uses: ['Destinatário («dou o livro ao amigo»).', 'Depois de к («em direção a») e по.', 'Construções com «мне» («eu gosto», «eu preciso»).'],
    examples: [['к', 'n:друг'], ['к', 'n:врач'], ['к', 'n:сестра']],
  },
  inst: {
    title: 'Instrumental',
    asks: 'Com quem? Com quê?',
    uses: ['Companhia, com с («com o amigo»).', 'Instrumento («escrevo com a caneta»).', 'Depois de за, над e под (atrás, sobre, sob).', 'Profissão com «быть» no passado e no futuro.'],
    examples: [['с', 'n:друг'], ['с', 'n:сестра'], ['с', 'n:брат']],
  },
  prep: {
    title: 'Preposicional',
    asks: 'Onde? Sobre quem/o quê?',
    uses: ['Só existe depois de preposição.', 'Lugar, com в/на («na casa», «no trabalho»).', 'Assunto, com о/об («sobre o amigo»).'],
    examples: [['в', 'n:дом'], ['на', 'n:работа'], ['о', 'n:друг']],
  },
};

export interface LessonExample {
  pre: string;
  ru: string;
  pt: string;
}

/** Exemplos montados a partir dos dados; ignora lemas sem forma disponível. */
export function lessonExamples(ix: ContentIndex, c: Exclude<GramFocus, 'all'>): LessonExample[] {
  const out: LessonExample[] = [];
  for (const [pre, id] of LESSONS[c].examples) {
    const l = ix.lemma.get(id);
    if (!l) continue;
    const word = pre === 'это' ? ix.lemma.get('o:это')?.s : pre; // palavra curta com acento dos dados
    if (!word) continue;
    const ru = c === 'nom' ? l.s : answerFor(ix, { lemma: id, c: c as Case, n: 'sg' })?.[0];
    if (ru) out.push({ pre: word, ru, pt: l.pt.split(';')[0].trim() });
  }
  return out;
}
