// Regra inviolável: nenhuma palavra russa na UI sem acento (U+0301), exceto monossílabos (ё conta como tônica).
// Estes testes cobrem o que content.test.ts não cobre: títulos/textos, glosas e o TEXTO FIXO do código da UI.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Content } from '../shared/types';
import { cyrillicTokens, wordHasRequiredStress } from '../shared/russian';

const content = JSON.parse(readFileSync('public/data/content.json', 'utf8')) as Content;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Terminações (não palavras) usadas nas tabelas de regras de src/lib/grammar.ts. Lista explícita para ser revisada. */
const SUFFIXES = new Set([
  'ами', 'ями', 'ому', 'ему', 'ыми', 'ими', 'ией', 'ием', 'ию', 'ией', 'мени', 'менем', 'енам', 'енами', 'енах', 'ьми',
]);

/**
 * Literais do código que NÃO são texto exibido: 'это' é chave de busca trocada pela forma dos dados em
 * src/lib/lessons.ts; a outra é a fileira de letras do teclado na tela (src/components/TypeInput.tsx).
 */
const PLACEHOLDERS = new Set(['это', 'абвгдежзийклмнопрстуфхцчшщъыьэюя']);

/** Tokens cirílicos sem acento que a regra proíbe. Terminações (“-ого”, “→ -ий”) e letras soltas não são palavras. */
export function unaccentedWords(text: string): string[] {
  const bad: string[] = [];
  const re = /[Ѐ-ӿ́]+(?:-[Ѐ-ӿ́]+)*/g;
  for (const m of text.normalize('NFC').matchAll(re)) {
    const tok = m[0];
    const before = text[m.index! - 1];
    if (before === '-' || before === '–') continue; // terminação/sufixo: "-ого", "-ия"
    if (before === ':') continue; // id de lema ('n:сестра', 'v:идти'): a UI mostra a forma acentuada vinda dos dados
    if (PLACEHOLDERS.has(tok)) continue;
    if (SUFFIXES.has(tok)) continue;
    if ([...tok].length <= 2) continue; // 'ия', 'ие'… são terminações em comparações do código, não palavras
    if (cyrillicTokens(tok).length && !wordHasRequiredStress(tok)) bad.push(tok);
  }
  return bad;
}

describe('regra do acento — texto fixo da UI e do conteúdo', () => {
  it('detector: aceita monossílabo, ё, acento e terminações; rejeita polissílabo sem acento', () => {
    expect(unaccentedWords('дом ребёнок молоко́ -ого → -ий')).toEqual([]);
    expect(unaccentedWords('молоко')).toEqual(['молоко']);
    expect(unaccentedWords('дом и молоко')).toEqual(['молоко']);
  });

  it('código-fonte da UI (src/**) não tem palavra russa sem acento', () => {
    const bad: string[] = [];
    for (const f of walk('src')) {
      const src = readFileSync(f, 'utf8');
      // {{n:молоко}} / {{p:n:молоко}} são expandidos a partir dos dados (já acentuados) — não contam como texto fixo
      const text = src.replace(/\{\{[^}]*\}\}/g, '');
      for (const w of unaccentedWords(text)) bad.push(`${f}: ${w}`);
    }
    expect(bad).toEqual([]);
  });

  it('textos, títulos e frases do conteúdo', () => {
    const bad: string[] = [];
    for (const t of content.texts) unaccentedWords(t.title).forEach((w) => bad.push(`${t.id} (título): ${w}`));
    for (const s of content.sentences) unaccentedWords(s.ru).forEach((w) => bad.push(`${s.id}: ${w}`));
    expect(bad).toEqual([]);
  });
});
